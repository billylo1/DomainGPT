/*
- add spinner
-

*/

import { ChatGPTAPI } from 'chatgpt'
import whois from 'whois-json';
import functions from "firebase-functions";

let apiClient;

let admin, db;

const numOptions = 5;

function initializeGPT() {

    if (apiClient == undefined) {
        apiClient = new ChatGPTAPI({ apiKey: process.env.API_KEY })
    }
}

export const askdomaingpt = functions.runWith({timeoutSeconds: 240}).
    https.onRequest(async (request, response) => {

    try {
        let prompt, initial;
        initializeGPT();
        prompt = request.body.prompt;
        console.log('askDomainGPT called with prompt: ' + prompt);
        initial = request.body.initial;
        
        let res = request.body;
        if (initial == undefined || initial == true) {
            res = await initialize(prompt);
        } else {
            res = await followUp(res, prompt);
        }
        // console.log('Response: ' + res.text);
        response.send(res);

    } catch (e) {
        console.error(e);
        response.send(e);
    }
});

async function initialize(startupPrompt) {

    console.log('Initializing...  Sending prompt: ' + startupPrompt);
    let res = await sendMessageWithRetry(`Suggest ${numOptions*2} domain names for a company that ${startupPrompt}`)
    res = await checkDomainAvailability(res);
    return Promise.resolve(res);

}

async function sendMessageWithRetry(...args) {

    let count = 0;
    let done = false;
    let res;

    while (count < 3 && !done) {
        try {
            res = await apiClient.sendMessage(...args)
            // console.log(res);
            done = true;
        } catch (e) {
            console.error(e.message);
            count++;
            console.warn(`Retrying... ${count}`)
        }
    }

    if (done) {
        return Promise.resolve(res);
    } else {
        return Promise.reject(res);
    }
}

async function followUp(res, followUpPrompt) {

    console.log('Sending follow up prompt: ' + followUpPrompt);
    // console.log(res);
    res = await sendMessageWithRetry(followUpPrompt, {
        conversationId: res.conversationId,
        parentMessageId: res.id
    })

    res = await checkDomainAvailability(res);
    return Promise.resolve(res);
}

async function checkDomainAvailability(res) {

    let availableDomains = [];
    let done = false;

    do {
        // console.log(res.text);
        let domains = res.text.split('\n');
        for (let domain of domains) {
            const splitText = domain.split(' ');
            if (splitText.length >= 2) {
                const domainName = splitText[1].replace(/,/g, '');
                try {
                    const domainInfo = await whois(domainName);
                    if (!domainInfo.hasOwnProperty('domainName')) {
                        availableDomains.push(domainName);
                        if (availableDomains.length >= numOptions) {
                            done = true;
                            break;
                        }
                    } else {
                        console.log(domainName + ' is not available');
                    }
                } catch (e) {
                    console.log('Error: ' + domainName);
                    console.log(e);
                }
            } else {
                console.warn('Error: ' + domain);
                done = true;
            }
        }

        if (!done) {
            console.log('Requesting more suggestions and checking availability...')

            res = await sendMessageWithRetry(`Ten more suggestions please`, {
                conversationId: res.conversationId,
                parentMessageId: res.id
            })
        }
    } while (!done)

    console.log(availableDomains);
    res.availableDomains = availableDomains;
    return Promise.resolve(res);

}

