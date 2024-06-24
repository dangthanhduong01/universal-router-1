### To Deploy
yarn install

forge install

bash ./create_file.sh <FILE-NAME> <V3FACRORYADDRES> <PERMITV2ADDRESS> <WETHADDRESS>

forge build

forge script --broadcast --rpc-url <RPC-URL> --private-key <YOUR-PRIVATEKEY> --sig 'run()' script/deployParameters/<FILE-NAME>.s.sol:<FILE-NAME>

Fill out parameters in `script/deployParameters/Deploy<network>.s.sol`

### To Deploy and Verify

```console
forge script --broadcast \
--rpc-url <RPC-URL> \
--private-key <PRIVATE-KEY> \
--sig 'run()' \
script/deployParameters/Deploy<network>.s.sol:Deploy<network> \
--etherscan-api-key <ETHERSCAN-API-KEY> \
--verify
```
