#!/bin/bash

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 folder_name file_name [content...]"
  exit 1
fi

file_name=$1
factory=$2
permit2=$3
weth9=$4

cat <<EOL > "script/deployParameters/$file_name.s.sol"
    // SPDX-License-Identifier: UNLICENSED
    pragma solidity ^0.8.15;

    import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
    import {RouterParameters} from 'contracts/base/RouterImmutables.sol';

    contract Deploy${file_name} is DeployUniversalRouter {
        function setUp() public override {
            params = RouterParameters({
                permit2: ${permit2},
                weth9: ${weth9},
                seaportV1_5: UNSUPPORTED_PROTOCOL,
                seaportV1_4: UNSUPPORTED_PROTOCOL,
                openseaConduit: UNSUPPORTED_PROTOCOL,
                nftxZap: UNSUPPORTED_PROTOCOL,
                x2y2: UNSUPPORTED_PROTOCOL,
                foundation: UNSUPPORTED_PROTOCOL,
                sudoswap: UNSUPPORTED_PROTOCOL,
                elementMarket: UNSUPPORTED_PROTOCOL,
                nft20Zap: UNSUPPORTED_PROTOCOL,
                cryptopunks: UNSUPPORTED_PROTOCOL,
                looksRareV2: UNSUPPORTED_PROTOCOL,
                routerRewardsDistributor: UNSUPPORTED_PROTOCOL,
                looksRareRewardsDistributor: UNSUPPORTED_PROTOCOL,
                looksRareToken: UNSUPPORTED_PROTOCOL,
                v2Factory: UNSUPPORTED_PROTOCOL,
                v3Factory: ${factory},
                pairInitCodeHash: BYTES32_ZERO,
                poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54
            });
        }
    }
EOL

echo "setup done!!!"