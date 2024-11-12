// Smart contract setub
const claimsSCAddr = "0x7145583bBc28c63b495AeA3A3B618537840BadA0";
const regSCAddr = "0xDf9cc3308Eb28CB50279C9b245C94CD837f1b4Ba";
const recordsSCAddr = "0x34c5B629747d01041665664BD904032e4704fC2b";
const insuranceCompanyAddress = "0xdDc141fcd9087BB342174e1D6FEa162B621A792c";
let claimsContractABI;
let regContractABI;
let recordsContractABI;

// Ethers.js setup
const walletKey = "";
const etherscanAPI = "";
let prvider;
let signer;
let claimsSC;
let claimsSCIface;
let regSC;
let regSCIface;
let recordsSC;
let recordsSCIface;

// OpenAI setup
const apiKey = "";
let assistantId;
let vectorStoreId;
let threadId;
let runId;
let callId;
let txFiles = [];
let i;
let t = 1;
let r;
let blockNo = "0";
let blockNo2 = "0";
let n = 0;
let f = 0;


// JavaScript code to handle message input and displaying
document.getElementById("send-btn").addEventListener("click", sendMessage);

main();

async function main() {
    await getContract();
    await createAssistant();
    await createVectorStore("Health Insurance Claim Transactions");
    await createThread();
    await getSCTransactions(claimsSC, claimsSCAddr, blockNo);
    await getSCTransactions(recordsSC, recordsSCAddr, blockNo);
    await getRegSCEvents(regSC, regSCAddr, blockNo);
    blockNo = blockNo2;

    claimsSC.on("ClaimRequestSubmitted", async (arg1, arg2, event) => { 
      if(arg2 == insuranceCompanyAddress) {
        console.log("New claim event received. Claim ID: ", arg1);
        console.log("Event: ", event);

        // Call the function to handle the event
        await handleClaimEvent(arg1, event);
      }
    });
  
}

// Function to create contract instance
async function getContract() {
  etherscanApiUrl = `https://api-sepolia.etherscan.io/api?module=contract&action=getabi&address=`;

  // Fetch the Claims SC ABI from Etherscan
  const contractAbiResponse = await fetch(`${etherscanApiUrl}${claimsSCAddr}`);
  const response = await contractAbiResponse.json();
  claimsContractABI = response.result;

  // Fetch the Registration SC ABI from Etherscan
  const contractAbiResponse2 = await fetch(`${etherscanApiUrl}${regSCAddr}`);
  const response2 = await contractAbiResponse2.json();
  regContractABI = response2.result;

  // Fetch the Records SC ABI from Etherscan
  const recordsContractAbiResponse = await fetch(`${etherscanApiUrl}${recordsSCAddr}`);
  const response3 = await recordsContractAbiResponse.json();
  recordsContractABI = response3.result;

  // Connect to Ethereum provider
  provider = new ethers.EtherscanProvider('sepolia', etherscanAPI);
  //provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/_lED9MPHnaaPp6BeECYRElg2O4s7HIKY");

  // Create a signer from the private key
  signer = new ethers.Wallet(walletKey, provider);
  
  // Create contract instances with the signer
  claimsSC = new ethers.Contract(claimsSCAddr, claimsContractABI, signer);
  regSC = new ethers.Contract(regSCAddr, regContractABI, signer);
  recordsSC = new ethers.Contract(recordsSCAddr, recordsContractABI, signer);

}

// Function to handle the claim event
async function handleClaimEvent(claimId) {
  await getSCTransactions(claimsSC, claimsSCAddr, blockNo);
  await getSCTransactions(recordsSC, recordsSCAddr, blockNo);
  await getSCTransactions(regSC, regSCAddr, blockNo);
  blockNo = blockNo2;
  console.log("New transactions retrieved and attached to the LLM successfully")
  
  const mess = `Does the claim with ID ${claimId} have a high likelihood of being fraudulent? Respond with 1 (for Yes) and 0 (for No)`
  await createThread();
  await createMessage(mess);
  const res = await getLLMResponse();
  await createThread();

  if(res[0] == "1") {
    console.log(`Claim #${claimId} has a high potential of being fraudulent.`);
    await handleFlaggedClaim(claimId);
  } else {
    console.log(`Claim #${claimId} shows no signs of being fraudulent.`);
  }
}

async function handleFlaggedClaim(claim) {
  let date = new Date();
  
  // Create new event for the flagged claim
  const flagEvent = {
    "event": {
      "eventName": "ClaimRequestFlagged",
      "logs": {
        "claimId": claim,
        "timestamp": date.toLocaleString()
      }
    }
  };
  console.log("Claim flagged successfully.");
  
  // Upload flag event to the RAG vector database
  const blob = new Blob([JSON.stringify(flagEvent, null, 2)], { type: 'application/json' });
  const fileName = `flaggedEvent#${++f}.json`; 
  const id = await uploadFileToOpenAI(blob, fileName);
  await addFileToVectorStore(id);

  // Push notification on the UI
  if (Notification.permission === "granted") {
    new Notification("Suspicious Activity Detected!", {
      body: `Claim #${claim} is flagged by the LLM for potential fraud. Please review the claim details for further investigation.`,
      icon: "flagIcon.png"
    });
  } else {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("Suspicious Activity Detected!", {
          body: `Claim #${claim} is flagged by the LLM for potential fraud. Please review the claim details for further investigation.`,
          icon: "flagIcon.png"
        });
      } else {
          console.log("Permission denied for notifications.");
      }
  });
  }
}

// Function to retrieve all patient transactions/events from the blockchain
async function getSCTransactions(contract, contractAddress, blockNo, toBlock = 'latest') {
    const url = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${contractAddress}&startblock=${blockNo}&endblock=${toBlock}&sort=asc&apikey=${etherscanAPI}`;

    let transactions = [];
    
    try {
      while (!(Array.isArray(transactions) && transactions.length > 0)) {
        const response = await axios.get(url);
        console.log('API Response:', response.data);
        transactions = response.data.result;
      }
  
      if (Array.isArray(transactions) && transactions.length > 0) {
        // Use Promise.all to handle all logs in parallel
        const logPromises = transactions.map(async (tx, index) => {
            blockNo2 = tx.blockNumber;
            console.log(`Transaction #${index + 1 + n}:`, tx);
            const decodedInput = contract.interface.parseTransaction({ data: tx.input });
            console.log("Decodded Input: ", decodedInput);
            const decodedLog = await getTxEvent(contract, tx.hash, (index+1+n));
            if (decodedInput) {
                return formatTransactionFile(tx, decodedInput, decodedLog, (index+1+n));
            }
        });
  
        // Wait for all logs to be processed in parallel
        await Promise.all(logPromises);

        n = n + transactions.length();

        // Once all transactions are formatted, save to a single file
        if (txFiles.length > 0) {
            console.log("Saving all transactions to a single file...");
            createTransactionsFile(txFiles);
        } else {
            console.log('No transactions to save.');
        }
  
      } else {
        console.log('No transactions found.');
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
}

// Function to get the transaction event
async function getTxEvent(contract, txHash, i) {
  const url = `https://api-sepolia.etherscan.io/api?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${etherscanAPI}`;
  
  let decodedLog;

  while(true) {
      try {
          const response = await axios.get(url);
          const event = response.data; // Access the data directly from the response

          // Check if event and event.result are defined
          if (event && event.result) {
              const result = event.result;

              // Check if logs exist
              if (result.logs) {
                  if (result.logs.length === 0) {
                      decodedLog = []; // No logs found
                      return decodedLog; // Return the decoded log
                  }
                  console.log(`Event #${i}:`, event);
                  decodedLog = contract.interface.parseLog(result.logs[0]); // Decode the first log
                  console.log("Decoded event: ", decodedLog);
                  return decodedLog; // Return the decoded log
              }
          } else {
              console.error('Unexpected response format:', event);
              return null; // Return null if the expected format is not met
          }

          // Introduce a delay if the transaction receipt is not yet available
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 2 seconds before the next fetch
      } catch (error) {
          console.error('Error fetching transaction receipt:', error);
      }
  }
}

// Function to reformat the retrieved transaction
function formatTransactionFile(tx, decodedInput, decodedLog, i) {
  // Convert timestamp from hex to decimal and then to a human-readable format
  const timestamp = tx.timeStamp ? new Date(parseInt(tx.timeStamp, 16) * 1000).toISOString() : 'N/A';

  // Create a new object with the formatted log and additional argument data
  const formattedTransaction = {
      contractAddress: tx.to,
      blockNumber: tx.blockNumber,
      transactionHash: tx.hash,
      //timeStamp: timestamp,
      function: {
          callerAddress: tx.from,
          functionName: decodedInput.name,
          functionInput: {},
          event: {
              eventName: decodedLog.name,
              eventLogs: {}
          }
      }
  };

  // Loop through decodedInput.args and add to formattedTransaction
  if (decodedInput.args.length >= 0) {
    decodedInput.args.forEach((arg, index) => {
      // Convert BigInt to string if necessary
      formattedTransaction.function.functionInput[decodedInput.fragment.inputs[index].name] = 
        typeof arg === 'bigint' ? arg.toString() : arg;
    });
  }

  // Loop through decodedLog.args and add to formattedTransaction
  if (decodedLog.args.length >= 0) {
    decodedLog.fragment.inputs.forEach((input, index) => {
      const logArg = decodedLog.args[index];

      // Convert BigInt to string if necessary
      formattedTransaction.function.event.eventLogs[input.name] = 
        typeof logArg === 'bigint' ? logArg.toString() : logArg;
    });
  }

  txFiles.push(formattedTransaction);

}

// Function to save all transactions to a single file
async function createTransactionsFile(transactions) {
  // Convert transactions to a Blob
  const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' });
  const fileName = `TransactionsList#${t}.json`; 

  //saveAs(blob, fileName);

  console.log(`All transactions saved as ${fileName}`);

  const id = await uploadFileToOpenAI(blob, fileName);
  await addFileToVectorStore(id);

  txFiles = [];
}

// Function to send the user's message and display LLM response
async function sendMessage() {
  const userMessage = document.getElementById("user-input").value;

  // Check if input is not empty
  if (userMessage.trim() !== "") {
      // Display user's message
      displayMessage(userMessage, "user-message", "userIcon.png"); // Update to use user icon

      // Clear the input
      document.getElementById("user-input").value = "";

      // Send user message to LLM
      await createMessage(userMessage);

      // Get LLM response and display it
      const llmResponse = await getLLMResponse();
      displayMessage(llmResponse, "llm-message", "llmIcon.png"); // Update to use LLM icon
  }
}

// Function to display messages
function displayMessage(message, messageType, iconName) {
  const chatBox = document.getElementById("chat-box");

  // Create message container
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", messageType);

  // Create icon container
  const iconDiv = document.createElement("div");
  iconDiv.classList.add("icon");
  const img = document.createElement("img");
  img.src = `${iconName}`; // Dynamically set the image source
  img.alt = messageType === "user-message" ? "User Icon" : "LLM Icon";
  iconDiv.appendChild(img);

  // Create message content container
  const messageContentDiv = document.createElement("div");
  messageContentDiv.classList.add("message-content");
  messageContentDiv.textContent = message; // Set the message text

  // Append icon and message content to message container
  messageDiv.appendChild(iconDiv);
  messageDiv.appendChild(messageContentDiv);

  // Append the message container to the chat box
  chatBox.appendChild(messageDiv);

  // Scroll to the bottom of the chat box
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Retrieve and display LLM response
async function getLLMResponse() {
  while(true) {
    const messages = await getMessageResponse();
    const message = messages.data[0];
    const run = await getThreadRun();
    console.log("run: ", run);
    console.log(message);
    
      if (run.status == "requires_action" && run.required_action.type == "submit_tool_outputs") {
          if (run.required_action.submit_tool_outputs.tool_calls[0].function.name == "approveClaim") {
            callId = run.required_action.submit_tool_outputs.tool_calls[0].id;
            console.log("callId: ", callId);
            const arg = JSON.parse(run.required_action.submit_tool_outputs.tool_calls[0].function.arguments);
            const id = arg.claimID;
            const output = await approveClaim(id);
            await submitToolOutputs(output, run.thread_id, run.id, callId);
          } else if (run.required_action.submit_tool_outputs.tool_calls[0].function.name == "rejectClaim") {
            callId = run.required_action.submit_tool_outputs.tool_calls[0].id;
            console.log("callId: ", callId);
            const arg = JSON.parse(run.required_action.submit_tool_outputs.tool_calls[0].function.arguments);
            const id = arg.claimID;
            const output = await rejectClaim(id);
            await submitToolOutputs(output, run.thread_id, run.id, callId);
          } else if (run.required_action.submit_tool_outputs.tool_calls[0].function.name == "getClaimStatus") {
            callId = run.required_action.submit_tool_outputs.tool_calls[0].id;
            console.log("callId: ", callId);
            const arg = JSON.parse(run.required_action.submit_tool_outputs.tool_calls[0].function.arguments);
            const id = arg.claimID;
            const output = await getClaimStatus(id);
            await submitToolOutputs(output, run.thread_id, run.id, callId);
          }
      } else if (message && message.role === 'assistant' && message.content.length>0) {
        console.log('Assistant response:', message.content[0].text.value);
        // Replace all citations with an empty string
        const llmMess = message.content[0].text.value.replace('**', '').replace(/【\d+:\d+†.*?】/g, '');
        return llmMess;
      }
  }
}

// Functions to call SC functions

async function getClaimStatus(id) {
  const response = await claimsSC.getClaimStatus(id);
  console.log(`Claim ${id} status: ${response}`);
  return response;
}

async function approveClaim(id) {
  const provider2 = new ethers.BrowserProvider(window.ethereum);
  await provider2.send('eth_requestAccounts', []);

  // Get the signer (which represents the connected account)
  const signer2 = await provider2.getSigner();

  // Create new contract instance with the new signer
  const contract = new ethers.Contract(claimsSCAddr, contractABI, signer2);
  
  const response = await contract.approveClaimRequest(id);
  console.log("Claim is approved successfully. Transaction hash: ", response.hash);
  return response.hash;
}

async function rejectClaim(id) {
  const provider2 = new ethers.BrowserProvider(window.ethereum);
  await provider2.send('eth_requestAccounts', []);

  // Get the signer (which represents the connected account)
  const signer2 = await provider2.getSigner();

  // Create new contract instance with the new signer
  const contract = new ethers.Contract(claimsSCAddr, contractABI, signer2);
  
  const response = await contract.rejectClaimRequest(id);
  console.log("Claim is rejected successfully. Transaction hash: ", response.hash);
  return response.hash;
}





////////////////////////////// OpenAI Functions //////////////////////////////

// Function to create OpenAI Assistant with file search and function calling tools
async function createAssistant() {
    try {
      const response = await fetch('https://api.openai.com/v1/assistants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          name: "Health Insurance Claims Fraud Detection Assistant",
          instructions: "You are an AI assistant responsible for detecting frauds in health insurance claims. You are attached with transactions from the blockchain. Using these transactions, you have to answer queries related to insurance claims frauds. Analyze all transactions carefully to detect different types of frauds such as: duplicated claims, higher claim amount than usual, services not performed, services not required/wrong diagnosis, and services already paid fully by patients. Make your answers brief and to the point.",
          model: "gpt-4o", 
          tools: [{ type: "file_search" }, 
            { type: "function",
              function: {
                "name": "getFlaggedClaims",
                "description": "This function is to get the list of flagged claim requests. Only call this when the user asks to get the flagged claims.",
                "parameters": {}
              }
            }, 
            { type: "function",
              function: {
                "name": "getPendingClaims",
                "description": "This function is to get the list of pending claim requests. Only call this when the user asks to get the pending claims.",
                "parameters": {}
              }
            }, 
            { type: "function",
              function: {
                "name": "approveClaim",
                "description": "This function is to change the claim request status on the smart contract to approved",
                "parameters": {
                  "type": "object",
                  "properties": {
                      "claimID": {
                          "type": "integer",
                          "description": "The ID of the claim to approve"
                      }
                  },
                  "required": ["claimID"]
                }
              }
            }, 
            { type: "function",
              function: {
                "name": "rejectClaim",
                "description": "This function is to change the claim request status on the smart contract to rejected",
                "parameters": {
                  "type": "object",
                  "properties": {
                      "claimID": {
                          "type": "integer",
                          "description": "The ID of the claim to reject"
                      }
                  },
                  "required": ["claimID"]
                }
              }
            }, 
            { type: "function",
              function: {
                "name": "getClaimStatus",
                "description": "This function is to retrieve the claim request status from the smart contract",
                "parameters": {
                  "type": "object",
                  "properties": {
                      "claimID": {
                          "type": "integer",
                          "description": "The ID of the claim"
                      }
                  },
                  "required": ["claimID"]
                }
              }
            }
          ],
          temperature: 0.2
        }),
      });
  
      // Check if the request was successful
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
  
      // Parse and log the response data
      const data = await response.json();
      assistantId = data.id;
      console.log('Assistant Created:', data);
      console.log('Assistant ID: ', assistantId);
    } catch (error) {
      console.error('Error creating assistant:', error);
    }
}
  
// Function to create vector store to attach it to the assistant
async function createVectorStore(name) {
    const response = await fetch('https://api.openai.com/v1/vector_stores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({ name })
    });
  
    if (response.ok) {
      const data = await response.json();
      console.log('Vector Store Created:', data);
      console.log('Vector Store ID: ', data.id);
      vectorStoreId = data.id;
      await updateAssistant(assistantId, vectorStoreId); // Optionally update the assistant if required
    } else {
      console.error('Error creating vector store:', await response.json());
    }
}
  
// Function to upload a file to OpenAI
async function uploadFileToOpenAI(blob, fileName) {
    const formData = new FormData();
    formData.append('purpose', 'assistants');
    formData.append('file', blob, fileName);
  
    const response = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });
  
    if (response.ok) {
      const data = await response.json();
      console.log('File uploaded:', data);
      return data.id; // Return uploaded file ID
    } else {
      console.error('Error uploading file:', await response.json());
    }
}
  
// Function to add file to the vector store
async function addFileToVectorStore(fileId) {
    const url = `https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`, // Ensure you have your apiKey defined
            'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          file_id: fileId // Send an array of file IDs
        })
    });

    if (response.ok) {
        const data = await response.json();
        console.log('File added to vector store:', data);
    } else {
        console.error('Error fetching file:', await response.json());
        throw new Error(`Failed to fetch file: ${response.status}`);
    }
}

// Function to update the assistant with the vector store ID
async function updateAssistant(assistantId, vectorStoreId) {
    const response = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        tool_resources: { file_search: { vector_store_ids: [vectorStoreId] } }
      })
    });
  
    if (response.ok) {
      const data = await response.json();
      console.log('Assistant updated:', data);
    } else {
      console.error('Error updating assistant:', await response.json());
    }
}
  
// Function to create thread
async function createThread() {
    const url = 'https://api.openai.com/v1/threads';
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({}) // Sending an empty JSON object
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Request failed: ${errorData.error.message}`);
      }
  
      const responseData = await response.json();
      console.log('Response:', responseData);
      threadId = responseData.id;
    } catch (error) {
      console.error('Error:', error.message);
    }
}
  
// Function to create user message
async function createMessage(content) {
    const url = `https://api.openai.com/v1/threads/${threadId}/messages`;
  
    const payload = {
      role: 'user',
      content: content
    };
  
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify(payload)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create message: ${errorData.error.message}`);
      }
  
      const data = await response.json();
      console.log('Message created successfully:', data);
      await createThreadRun();
    } catch (error) {
      console.error('Error creating message:', error.message);
    }
}
  
// Function to initiate new thread run
async function createThreadRun() {
    const url = `https://api.openai.com/v1/threads/${threadId}/runs`;
  
    const payload = {
      assistant_id: assistantId
    };
  
    try {
      const response = await fetch(url, {
        method: 'POST', // Note: The method should be POST
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify(payload)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create thread run: ${errorData.error.message}`);
      }
  
      const data = await response.json();
      console.log('Thread run created successfully:', data);
      runId = data.id;
    } catch (error) {
      console.error('Error creating thread run:', error.message);
    }
}
  
// Function to get the assistant response
async function getMessageResponse() {
    const url = `https://api.openai.com/v1/threads/${threadId}/messages`;
  
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to retrieve messages: ${errorData.error.message}`);
      }
  
      const responseData = await response.json();
      console.log('Messages retrieved successfully:', responseData);
  
      return responseData;
    } catch (error) {
      console.error('Error retrieving messages:', error.message);
    }
}
  
// Function to retrieve the current run and return the run ID
async function getThreadRun() {
    const url = `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`;
  
    try {
      const response = await fetch(url, {
        method: 'GET',  // Default is GET, but explicitly mentioning it
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data = await response.json();
      console.log('Response data:', data);
      return data;
    } catch (error) {
      console.error('Error fetching the thread run:', error);
    }
}
  
// Function to submit outputs to the function calling tool
async function submitToolOutputs(output, threadId, runId, callID) {
    const url = `https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`;
  
    const payload = {
      tool_outputs: [
        {
          tool_call_id: callID,
          output: output
        }
      ]
    };
  
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify(payload)
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data = await response.json();
      console.log('Response data:', data);
      return data;
    } catch (error) {
      console.error('Error submitting tool outputs:', error);
    }
}
