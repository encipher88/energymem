const { ethers } = require('ethers');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Function to read the private keys from a file
function getPrivateKeys() {
    const filePath = path.join(__dirname, 'privkey.txt');
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    } catch (error) {
        console.error('Error reading private keys from file:', error);
        return [];
    }
}

// Replace with your actual file path
const privateKeys = getPrivateKeys();

if (privateKeys.length === 0) {
    console.error('No private keys found. Exiting...');
    process.exit(1);
}

// Message to sign
const message = 'Base Energy Login';

// Function to sign the message
async function signMessage(wallet) {
    try {
        const signature = await wallet.signMessage(message);
        console.log(`Signature from wallet ${wallet.address}:`, signature);
        return signature;
    } catch (error) {
        console.error(`Error signing message with wallet ${wallet.address}:`, error);
    }
}

// Function to send the signed message to an API endpoint with retry logic
async function sendSignedMessage(wallet, maxRetries = 5, retryDelay = 3000, longRetryDelay = 60000) {
    const signature = await signMessage(wallet);

    if (!signature) {
        console.error('Failed to sign message. Cannot send request.');
        return;
    }

    const apiUrl = 'https://api.energymemecoin.com/register';
    const requestBody = JSON.stringify({
        user: wallet.address,
        signature: signature,
        referer: 'SEy4r9' // CHANGE FOR YOUR REFERER!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    });

    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Priority': 'u=1, i',
        'Sec-CH-UA': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Referer': 'https://airdrop.energymemecoin.com/',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}: Sending request to ${apiUrl} with body: ${requestBody}`);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: requestBody
            });

            const responseText = await response.text();
            console.log(`Response Status for wallet ${wallet.address}:`, response.status);
            console.log('Response Body:', responseText);

            try {
                const responseData = JSON.parse(responseText);
                if (responseData.msg === 'Got error') {
                    console.error('API returned "Got error". Retrying in 60 seconds...');
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, longRetryDelay));
                    } else {
                        console.error('Max retries reached. Giving up.');
                        return;
                    }
                } else {
                    console.log('API Response:', responseData);
                    return; // Exit loop if response is successful
                }
            } catch (parseError) {
                console.error('Error parsing JSON response:', parseError);
            }

        } catch (error) {
            console.error(`Error sending request (attempt ${attempt}):`, error);
            if (attempt < maxRetries) {
                console.log(`Retrying in ${retryDelay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                console.error('Max retries reached. Giving up.');
            }
        }
    }
}

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Process each private key with a delay between each
async function processPrivateKeys() {
    for (const [index, privateKey] of privateKeys.entries()) {
        const wallet = new ethers.Wallet(privateKey);
        await sendSignedMessage(wallet);

        // Delay of 1 second (1000 milliseconds) between each private key
        if (index < privateKeys.length - 1) {
            console.log('Waiting for 1 second before processing the next private key...');
            await delay(10000);
        }
    }
}

// Execute the function to process all private keys
processPrivateKeys();
