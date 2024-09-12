const fs = require('fs');
const fetch = require('node-fetch');
const url = require('url');
const HttpsProxyAgent = require('https-proxy-agent');
const { createObjectCsvWriter } = require('csv-writer');

// Path to your files
const addressesFilePath = './addresses.txt';
const proxiesFilePath = './proxy.txt'; // File containing the list of proxies
const resultsFilePath = './results.csv'; // File to save results

const IP_CHANGE_LINK = 'https://....';

// Flag to enable or disable IP changes
const shouldChangeIP = false;

// Function to create a new HttpsProxyAgent
function createProxyAgent(proxyUrl, proxyAuth) {
    const proxyOpts = url.parse(proxyUrl);
    proxyOpts.auth = proxyAuth;
    return new HttpsProxyAgent(proxyOpts);
}

// Function to change the proxy IP
async function changeProxyIP() {
    try {
        console.log('Changing IP...');
        const response = await fetch(IP_CHANGE_LINK, { method: 'GET' });
        const data = await response.text(); // Read response as text to handle non-JSON responses
        
        // Check if the response contains the success indicator
        if (data.includes('success') || data.includes('IP changed')) {
            console.log('IP changed successfully:', data);
            return true; // Indicate IP change succeeded
        } else {
            console.error('Failed to change IP:', data);
            return false; // Indicate IP change failed
        }
    } catch (error) {
        console.error('Error changing IP:', error);
        return false; // Indicate IP change failed
    }
}

// Function to check the proxy's public IP and country
async function checkCurrentIP(agent) {
    try {
        const response = await fetch('https://ipinfo.io/json?', { agent });
        const data = await response.json();
        console.log(`Current Proxy IP: ${data.ip}, Country: ${data.country}`);
    } catch (error) {
        console.error('Error fetching current IP:', error);
    }
}

// Function to check the proxy's public IP using a fallback service
async function checkProxyIP(agent) {
    try {
        const response = await fetch('https://api.ipify.org?format=json', { 
            method: 'GET', 
            agent 
        });
        const data = await response.json();
        console.log(`Proxy IP: ${data.ip}`); // Output the proxy IP
    } catch (error) {
        console.error('Error fetching proxy IP:', error);
    }
}

// Function to read addresses from the file
function getAddresses() {
    return new Promise((resolve, reject) => {
        fs.readFile(addressesFilePath, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                // Split by newline to get each address on a new line
                const addresses = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                resolve(addresses);
            }
        });
    });
}

// Function to read proxies from the file
function getProxies() {
    return new Promise((resolve, reject) => {
        fs.readFile(proxiesFilePath, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                // Add 'http://' to each proxy and split by newline
                const proxies = data.split('\n').map(line => `http://${line.trim()}`).filter(line => line.length > 0);
                resolve(proxies);
            }
        });
    });
}

// Function to write results to a CSV file
async function writeResults(results) {
    const csvWriter = createObjectCsvWriter({
        path: resultsFilePath,
        header: [
            { id: 'address', title: 'Address' },
            { id: 'initPoints', title: 'Init Points' },
            { id: 'status', title: 'Status' }
        ]
    });

    try {
        await csvWriter.writeRecords(results);
        console.log('Results written to CSV file successfully.');
    } catch (error) {
        console.error('Error writing results to CSV file:', error);
    }
}

// Sleep function to introduce a delay (in milliseconds)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to make the API call for each address using a new proxy
async function checkAddress(address, proxy) {
    const [proxyUrl, proxyAuth] = proxy.split('@');
    const agent = createProxyAgent(proxyUrl, proxyAuth);
    const url = `https://api.energymemecoin.com/get_user?user=${address}`;
    
    const options = {
        method: 'GET',
        headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'Referer': 'https://airdrop.energymemecoin.com/',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        },
        agent // Use HttpsProxyAgent with proxy options
    };

    console.log(`Using proxy: ${proxy}`); // Log the current proxy being used

    // Check current IP
    await checkCurrentIP(agent);

    const result = {
        address,
        initPoints: 0,
        status: 'Not Checked'
    };

    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = await fetch(url, options);
            const data = await response.json();
            
            // Check if init_points > 0 for eligibility
            if (data.init_points > 0) {
                result.initPoints = data.init_points;
                result.status = 'Eligible';
                console.log(`Eligible Address: ${address}, Init Points: ${data.init_points}`);
            } else {
                result.status = 'Not Eligible';
                console.log(`Address: ${address} is not eligible`);
            }

            break; // Exit loop if request was successful
        } catch (error) {
            attempt++;
            console.error(`Error fetching data for ${address} (Attempt ${attempt}/${maxRetries}): `, error);

            if (attempt < maxRetries) {
                console.log('Retrying in 60 seconds...');
                await sleep(60000); // Wait for 60 seconds before retrying
            } else {
                result.status = 'Error';
                console.error(`Failed to fetch data for ${address} after ${maxRetries} attempts.`);
            }
        }
    }

    return result;
}

// Main function to run everything with 60 sec delay and IP change after each request
async function main() {
    const results = [];

    try {
        const addresses = await getAddresses();
        const proxies = await getProxies();
        
        if (addresses.length === 0 || proxies.length === 0) {
            throw new Error('No addresses or proxies found.');
        }

        for (let i = 0; i < addresses.length; i++) {
            if (i >= proxies.length) {
                console.log('No more proxies available. Exiting...');
                break;
            }

            const address = addresses[i];
            const proxy = proxies[i];

            const result = await checkAddress(address, proxy);
            results.push(result);

            // Wait for 60 seconds before the next request
            console.log('Waiting 1 seconds before the next request...');
            await sleep(1000);
            
            // Change proxy IP if enabled
            if (shouldChangeIP) {
                const ipChangeSuccessful = await changeProxyIP();
                if (!ipChangeSuccessful) {
                    console.log('Skipping IP change due to failure.');
                }
            }
        }

        // Write results to CSV file
        await writeResults(results);
    } catch (error) {
        console.error('Error: ', error);
    }
}

// Run the main function
main();
