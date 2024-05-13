import whois from 'whois-json';
import functions from "firebase-functions";

process.env.TZ = 'America/Toronto'
import OpenAI from "openai";
const numOptions = 5;
let chatHistory = [];

async function sendMessage(user_input) {

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, });

    const messageList = chatHistory.map(([input_text, completion_text]) => ({
        role: "user" === input_text ? "ChatGPT" : "user",
        content: input_text
    }));
    messageList.push({ role: "user", content: user_input });

    try {
        const GPTOutput = await openai.chat.completions.create({
            model: "gpt-4o-2024-05-13",
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

export const askdomaingpt = functions.runWith({
    timeoutSeconds: 240, memory: "2GB"}).
    https.onRequest(async (request, response) => {

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


async function checkDomainAvailability(res) {

    let availableDomains = [];
    let done = false;

    do {
        // console.log(res.text);
        let domains = res.text.split('\n');
        domains.shift();
        domains.shift();
        for (let domain of domains) {
            const splitText = domain.split(' ');
            if (splitText.length >= 2) {
                const domainName = splitText[1].replace(/,/g, '');
                try {
                    const domainInfo = await whois(domainName, { follow: 3, timeout: 3000 } );
                    if (!domainInfo.hasOwnProperty('domainName')) {
                        console.log(domainName + ' is available');

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
            // console.log('Requesting more suggestions and checking availability...')

            res = await sendMessage(`Ten more suggestions please`, {
                conversationId: res.conversationId,
                parentMessageId: res.id
            })
        }
    } while (!done)

    // console.log(availableDomains);
    res.availableDomains = availableDomains;
    return Promise.resolve(res);

}

