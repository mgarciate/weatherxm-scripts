import { ethers, utils } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import axios, { all } from 'axios';
import { constructSimpleSDK, SwapSide } from '@paraswap/sdk';

dotenvConfig({ path: resolve(__dirname, "../.env") });

interface WeatherXMResponse {
    proof: string[];
    cumulative_amount: string;
    cycle: number;
    available: string;
    total_claimed: string;
}

const erc20ContractABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
];
const wmxClaimContractABI = [
    "function claim(uint256 amount, uint256 _totalRewards, uint256 _cycle, bytes32[] calldata proof) external"
];

// Load the environment variables
const wmxClaimContractAddress = process.env.WXM_CLAIM_CONTRACT_ADDRESS!;
const chainId = parseInt(process.env.CHAIN_ID!);
const providerURL = process.env.RPC_URL;
const privateKey = process.env.WALLET_PK!;
const sourceTokenAddress = process.env.SOURCE_TOKEN_ADDRESS!;
const destinationTokenAddress = process.env.DESTINATION_TOKEN_ADDRESS!;
const destinationAddress = process.env.DESTINATION_ADDRESS;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

const provider = new ethers.providers.JsonRpcProvider(providerURL);
const wallet = new ethers.Wallet(privateKey, provider);
const gasLimit = ethers.utils.hexlify(500000);
const gasPrice = ethers.utils.parseUnits('0.1', 'gwei');

async function getWeatherXMRewards(address: string): Promise<WeatherXMResponse> {
    const url = `https://api.weatherxm.com/api/v1/network/rewards/withdraw?address=${address}`;

    try {
        const response = await axios.get<WeatherXMResponse>(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

async function getWXMBalance(): Promise<ethers.BigNumberish> {
    const tokenContract = new ethers.Contract(sourceTokenAddress, erc20ContractABI, provider);

    try {
        const balance: ethers.BigNumberish = await tokenContract.balanceOf(wallet.address);
        return balance;
    } catch (error) {
        console.error('Error fetching token balance:', error);
        throw error;
    }
}

function sendTelegramMessage(message: string) {
    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    axios.post(url, {
        chat_id: telegramChatId,
        text: message
    }).then(response => {
        console.log('Telegram message sent:', response.data);
    }).catch(error => {
        console.error('Error sending Telegram message:', error.message);
    });
}

async function swap(amount: ethers.BigNumberish) {
    const paraSwapMin = constructSimpleSDK({ chainId: chainId, axios });
    const priceRoute = await paraSwapMin.swap.getRate({
        srcToken: sourceTokenAddress,
        srcDecimals: 18,
        destToken: destinationTokenAddress,
        destDecimals: 18,
        amount: amount.toString(),
        userAddress: wallet.address,
        side: SwapSide.SELL,
    });
    console.log(priceRoute);

    const toContract = new ethers.Contract(
        sourceTokenAddress,
        erc20ContractABI,
        wallet,
    );
    const spender = await paraSwapMin.swap.getSpender();
    const allowance: ethers.BigNumber = await toContract.allowance(
        wallet.address,
        priceRoute.tokenTransferProxy
    );
    console.log("Allowance:", allowance.toString());

    // if allowance is less than amount, approve the spender
    if (allowance.lt(amount)) {
        // Approve the spender to spend the specified amount of tokens
        const nonce = await provider.getTransactionCount(wallet.address, 'latest');
        const tx = await toContract.approve(priceRoute.tokenTransferProxy, amount.toString(), {
            nonce: nonce,
            gasLimit: gasLimit, // Set a manual gas limit, adjust as needed
            gasPrice: gasPrice
        });
        console.log('Transaction sent:', tx.hash);
        const receipt = await tx.wait();
        console.log("Transaction confirmed:", receipt.transactionHash);
    }

    const txParams = await paraSwapMin.swap.buildTx(
        {
            srcToken: sourceTokenAddress,
            destToken: destinationTokenAddress,
            srcAmount: amount.toString(),
            destAmount: priceRoute.destAmount,
            priceRoute: priceRoute,
            userAddress: wallet.address,
            receiver: destinationAddress,
        }
    );
    console.log(txParams);
    delete txParams.gas;
    const nonce = await provider.getTransactionCount(wallet.address, 'latest');
    const transaction = {
        ...txParams,
        nonce: nonce,
        gasLimit: gasLimit, // Set a manual gas limit, adjust as needed
        gasPrice: gasPrice
    };

    const tx = await wallet.sendTransaction(transaction);
    console.log('Paraswap transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log("Paraswap transaction confirmed:", receipt.transactionHash);

    if (telegramChatId && telegramBotToken) {
        sendTelegramMessage(`Swapped ${ethers.utils.formatUnits(amount, 18)} WXM to ${ethers.utils.formatUnits(priceRoute.destAmount, 18)} ETH with tx hash: https://arbiscan.io/tx/${tx.hash}`);
    }
}

async function main() {
    // Connect to the contract
    const contract = new ethers.Contract(wmxClaimContractAddress, wmxClaimContractABI, wallet);
    var rewardsData: WeatherXMResponse;
    try {
        rewardsData = await getWeatherXMRewards(wallet.address);
        console.log(rewardsData);
    } catch (error: any) {
        console.error('Error fetching rewards data:', error.response.status, error.message);
        return;
    }

    if (rewardsData.available !== "0") { // Check if there are available rewards to claim
        // Define the parameters for the claim function
        const amount = rewardsData.available;
        const totalRewards = rewardsData.cumulative_amount;
        const cycle = rewardsData.cycle;
        const proof = rewardsData.proof;

        try {
            const nonce = await provider.getTransactionCount(wallet.address, 'latest');
            console.log("Nonce:", nonce);
            // Call the claim function
            const tx = await contract.claim(amount, totalRewards, cycle, proof, {
                nonce: nonce,
                gasLimit: gasLimit, // Set a manual gas limit, adjust as needed
                gasPrice: gasPrice
            });
            console.log("Transaction sent:", tx.hash);

            // Wait for the transaction to be confirmed
            const receipt = await tx.wait();
            console.log("Transaction confirmed:", receipt.transactionHash);
        } catch (error) {
            console.error("Error calling claim function:", error);
        }
    } else {
        console.log("No rewards available to claim.");
    }
    const balance = await getWXMBalance();
    if (ethers.BigNumber.from(balance).gt(0)) {
        console.log(`Balance: ${balance}`);
        swap(balance);
    } else {
        console.log("No WXM balance to trade.");
    }
}

// execute the main function every 60 minutes
setInterval(main, 60 * 60 * 1000);
main();
