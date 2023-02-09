import { ChatGPTAPI } from 'chatgpt'
import whois from 'whois-json';
import { initializeApp } from 'firebase-admin/app';
import functions from "firebase-functions";

let apiClient;

let admin, db;

const numOptions = 5;

function initializeGPT() {

    // if (db == undefined) {
    //     admin = initializeApp({ credential: admin.credential.cert(serviceAccount) });
    //     db = admin.firestore();
    //     console.log('Firebase initialized');
    // }

    if (apiClient == undefined) {
        apiClient = new ChatGPTAPI({ apiKey: process.env.API_KEY })
    }
}

export const askdomaingpt = functions.https.onRequest(async (request, response) => {

    try {
        initializeGPT();
        console.log('askDomainGPT');
        let prompt = request.query.prompt;
        let initial = request.query.initial;
        let output;
        if (initial == undefined || initial == true) {
            output = await initialize(prompt);
        } else {
            output = await followUp(prompt);
        }
        response.send(output);

    } catch (e) {
        console.error(e);
        response.send(e);
    }
});

async function initialize(startupPrompt) {

    console.log('Initializing...');
    let res = await sendMessageWithRetry(`Suggest ${numOptions} domain names for a company that ${startupPrompt}`)
    await showAvailableDomains(res);
    return Promise.resolve(res);

}

async function sendMessageWithRetry(...args) {

    let count = 0;
    let done = false;
    let res;

    while (count < 3 && !done) {
        try {
            console.log(count)
            res = await apiClient.sendMessage(...args)
            done = true;
        } catch (e) {
            console.log(e);
            count++;
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

    await showAvailableDomains(res);
    return Promise.resolve(res);
}

async function showAvailableDomains(res) {

    let availableDomains = [];
    let done = false;

    do {
        let domains = res.text.split('\n');
        for (let domain of domains) {
            const domainName = domain.split(' ')[1].trim();
            // console.log(domainName);
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
    return Promise.resolve({availableDomains: availableDomains});

}

