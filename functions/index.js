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

export const askdomaingpt = functions.https.onRequest(async (request, response) => {

    try {
        let prompt, initial;
        initializeGPT();
        if (request.method == 'GET') {
            prompt = request.query.prompt;
            console.log('askDomainGPT called with prompt: ' + prompt);
            initial = request.query.initial;
        } else if (request.method == 'POST') {
            prompt = request.body.prompt;
            console.log('askDomainGPT called with prompt: ' + prompt);
            initial = request.body.initial;
        }
        
        let res;
        if (initial == undefined || initial == true) {
            res = await initialize(prompt);
        } else {
            res = await followUp(prompt);
        }
        console.log('Response: ' + res.text);
        response.send(res);

    } catch (e) {
        console.error(e);
        response.send(e);
    }
});

async function initialize(startupPrompt) {

    console.log('Initializing...  Sending prompt: ' + startupPrompt);
    let res = await sendMessageWithRetry(`Suggest ${numOptions} domain names for a company that ${startupPrompt}`)
    await checkDomainAvailability(res);
    return Promise.resolve(res);

}

async function sendMessageWithRetry(...args) {

    let count = 0;
    let done = false;
    let res;

    while (count < 3 && !done) {
        try {
            res = await apiClient.sendMessage(...args)
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

    res = await sendMessageWithRetry(followUpPrompt, {
        conversationId: res.conversationId,
        parentMessageId: res.id
    })

    await checkDomainAvailability(res);
    return Promise.resolve(res);
}

async function checkDomainAvailability(res) {

    let availableDomains = [];
    let done = false;

    do {
        let domains = res.text.split('\n');
        for (let domain of domains) {
            const domainName = domain.split(' ')[1].trim();
            console.log(domainName);
            try {
                const domainInfo = await whois(domainName);
                console.log(domainName);
                if (!domainInfo.hasOwnProperty('domainName')) {
                    availableDomains.push(domainName);
                    if (availableDomains.length >= numOptions) {
                        done = true;
                        break;
                    }
                }
            } catch (e) {
                console.log('Error: ' + domainName);
                console.log(e);
            }
        }

        if (!done) {
            console.log('Requesting more suggestions and checking availability...')

            res = await sendMessageWithRetry(`${numOptions} more suggestions please`, {
                conversationId: res.conversationId,
                parentMessageId: res.id
            })
        }
    } while (!done)

    console.log(availableDomains);
    res.availableDomains = availableDomains;
    return Promise.resolve(res);

}

