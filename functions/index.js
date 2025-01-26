import whois from 'whois-json';
import functions from "firebase-functions/v1";

process.env.TZ = 'America/Toronto'
import OpenAI from "openai";
const numOptions = 5;
let chatHistory = [];

async function sendMessage(user_input) {

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY});

    const messageList = chatHistory.map(([input_text, completion_text]) => ({
        role: "user" === input_text ? "ChatGPT" : "user",
        content: input_text
    }));
    messageList.push({ role: "user", content: user_input });

    try {
        const GPTOutput = await openai.chat.completions.create({
            model: "chatgpt-4o-latest",
            messages: messageList,
        });

        const output_text = GPTOutput.choices[0].message.content;
        console.log(output_text);

        chatHistory.push([user_input, output_text]);
        return Promise.resolve({text: output_text});

    } catch (err) {
        if (err.response) {
            console.log(err.response.status);
            console.log(err.response.data);
        } else {
            console.log(err.message);
        }
    }

}

export const checkDomain = functions.https.onRequest(async (request, response) => {

    try {
        let domainName = request.query.domain;
        const domainInfo = await checkWithGoDaddy(domainName);
        return response.send(domainInfo);
    } catch (e) {
        console.error(e);
        response.send(e);
    }
}
)

export const askdomaingpt = functions.runWith({
    timeoutSeconds: 240, memory: "2GB"}).https.onRequest(async (request, response) => {

    try {
        let prompt, initial;
        prompt = request.body.prompt;
        if (prompt == undefined) {
            return response.send('No prompt provided');
        }
        console.log('askDomainGPT called with prompt: ' + prompt);
        initial = request.body.initial;
        
        let res = request.body;
        if (initial == undefined || initial == true) {
            res = await initialize(prompt);
        } else {
            res = await sendMessageAndCheckDomain(prompt);
        }
        // console.log('Response: ' + res.text);
        response.send(res);

    } catch (e) {
        console.error(e);
        response.send(e);
    }
});

async function initialize(startupPrompt) {

    // console.log('Initializing...  Sending prompt: ' + startupPrompt);
    let res = await sendMessageAndCheckDomain(`Suggest ${numOptions*2} domain names for a company that ${startupPrompt}`)
    return Promise.resolve(res);

}

// retry is a must-have. API is unstable.

async function sendMessageAndCheckDomain(message) {

    try {
        let res = await sendMessage(message, chatHistory)
        res = await checkDomainAvailability(res);
        return Promise.resolve(res);
    } catch (e) {
        console.log(e);
        return Promise.reject(e);
    }
}

function isValidDomainName(domainName) {
    return /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(domainName);
}

async function checkWithGoDaddy(domainName) {
    
    domainName = encodeURIComponent(domainName);
    console.log('Checking with GoDaddy...' + domainName);
    const url = 'https://api.ote-godaddy.com/v1/domains/available?domain=' + domainName;
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'sso-key 3mM44WkB2Aifht_9ziNMQDFwKLrcFXUKoNWfg:9WKaxuKaCnN1oGbYHiU7UY'
        }
    });
    let responseJson = await res.json();
    console.log(responseJson);
    return responseJson;
}

async function checkDomainAvailability(res) {

    let availableDomains = [];
    let done = false;
    var checkCount = 0;

    do {
        // console.log(res.text);
        let domains = res.text.split('\n');
        domains.shift();
        domains.shift();
        for (let domain of domains) {
            const splitText = domain.split(' ');
            if (splitText.length >= 2) {
                var domainName = splitText[1].replace(/,/g, '');
                domainName = domainName.replaceAll("**", "");
                try {
                    // const domainInfo = await whois(domainName, { timeout: 7000 } );
                    // if (domainInfo.hasOwnProperty('rateLimitExceededTryAgainAfter')) {
                    //     availableDomains.push("Sorry, whois server quota has been exceeded. Please try again in a few minutes.");
                    //     res.availableDomains = availableDomains;
                    //     console.error('Rate limit exceeded');
                    //     return Promise.resolve(res);                    
                    // }
                    if (isValidDomainName(domainName)) {
                        const domainInfo = await checkWithGoDaddy(domainName);
                        if (domainInfo.available) {
                            console.log(domainName + ' is available');
                            availableDomains.push(domainName);
                            if (availableDomains.length >= numOptions) {
                                done = true;
                                break;
                            } 
                        } else {
                            console.log(domainName + ' is not available');
                        }                            
                    } else {
                        console.warn('Invalid domain name: ' + domainName);
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

        if (!done && checkCount < 5) {
            // console.log('Requesting more suggestions and checking availability...')

            res = await sendMessage(`Five more suggestions please`, {
                conversationId: res.conversationId,
                parentMessageId: res.id
            })

            checkCount++;
        }
    } while (!done)

    // console.log(availableDomains);
    res.availableDomains = availableDomains;
    return Promise.resolve(res);

}

