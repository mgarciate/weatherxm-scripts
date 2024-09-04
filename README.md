# weatherxm-scripts
List of useful scripts to work with WeatherXM data

Install the dependencies:
```bash
yarn
```

Set the environment variables:
```bash
cp .env.example .env
```

```bash
# Upload script
WXM_DEVICE_ID=
WXM_TOKEN=
WXM_REFRESH_TOKEN=
WUNDERGROUND_STATION_ID=
WUNDERGROUND_STATION_PASSWORD=
# Claim script
CHAIN_ID=42161
RPC_URL=https://arb1.arbitrum.io/rpc
WXM_CLAIM_CONTRACT_ADDRESS=0x2CDBa04dcFD3999ef3FDa00121b23c693AF4041b
SOURCE_TOKEN_ADDRESS=0xb6093b61544572ab42a0e43af08abafd41bf25a6
DESTINATION_TOKEN_ADDRESS=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
DESTINATION_ADDRESS=[ADDRESS WHERE YOU WANT THE ETH TO BE SENT]
WALLET_PK=[PRIVATE KEY]
```

## Claim rewards
This script checks if there are any WXM rewards available to claim. If rewards are available, it executes the transaction to claim them. Additionally, it swaps WXM to ETH and sends the specified amount to a given address.

```bash
yarn claim-dev
```

## Send current data to Wunderground
This script requests current weather data from WeatherXM for a given station ID, processes the data, and uploads it to Wunderground for a specified station that has already been created.

```bash
yarn upload-dev
```
