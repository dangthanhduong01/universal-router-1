import { Router, Permit2, ERC721, ERC20 } from '../../typechain-types'
import { BigNumber, Signer } from 'ethers'
import { Pair } from '@uniswap/v2-sdk'
import { expect } from './shared/expect'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/tokens/ERC20.sol/ERC20.json'
import { abi as ERC721_ABI } from '../../artifacts/solmate/tokens/ERC721.sol/ERC721.json'
import NFTX_ZAP_ABI from './shared/abis/NFTXZap.json'
import deployRouter, { deployPermit2 } from './shared/deployRouter'
import {
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  DEADLINE,
  OPENSEA_CONDUIT_KEY,
  NFTX_COVEN_VAULT,
  NFTX_COVEN_VAULT_ID,
} from './shared/constants'
import {
  seaportOrders,
  seaportInterface,
  getOrderParams,
  getAdvancedOrderParams,
  AdvancedOrder,
  Order,
} from './shared/protocolHelpers/seaport'
import { resetFork, WETH, DAI } from './shared/mainnetForkHelpers'
import { CommandType, RoutePlanner } from './shared/planner'
import { makePair } from './shared/swapRouter02Helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'

const { ethers } = hre
const nftxZapInterface = new ethers.utils.Interface(NFTX_ZAP_ABI)

describe('Router', () => {
  let alice: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let daiContract: ERC20
  let pair_DAI_WETH: Pair

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice) as ERC20
    pair_DAI_WETH = await makePair(alice, DAI, WETH)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployRouter(permit2)).connect(alice) as Router
  })

  describe('#execute', async () => {
    let planner: RoutePlanner

    beforeEach(async () => {
      planner = new RoutePlanner()
      await daiContract.transfer(router.address, expandTo18DecimalsBN(5000))
    })

    it('reverts if block.timestamp exceeds the deadline', async () => {
      planner.addCommand(CommandType.TRANSFER, [
        DAI.address,
        pair_DAI_WETH.liquidityToken.address,
        expandTo18DecimalsBN(1),
      ])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], alice.address])
      const invalidDeadline = 10

      const { commands, inputs } = planner

      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, invalidDeadline)).to.be.revertedWith(
        'TransactionDeadlinePassed()'
      )
    })

    it('reverts for an invalid command at index 0', async () => {
      const commands = '0xff'
      const inputs: string[] = ['0x12341234']

      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.be.revertedWith(
        'InvalidCommandType(31)'
      )
    })

    it('reverts for an invalid command at index 1', async () => {
      const invalidCommand = 'ff'
      planner.addCommand(CommandType.TRANSFER, [
        DAI.address,
        pair_DAI_WETH.liquidityToken.address,
        expandTo18DecimalsBN(1),
      ])
      let commands = planner.commands
      let inputs = planner.inputs

      commands = commands.concat(invalidCommand)
      inputs.push('0x21341234')

      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.be.revertedWith(
        'InvalidCommandType(31)'
      )
    })

    describe('partial fills', async () => {
      let covenContract: ERC721
      let nftxValue: BigNumber
      let numCovens: number
      let value: BigNumber
      let invalidSeaportCalldata: string
      let seaportValue: BigNumber

      beforeEach(async () => {
        covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice) as ERC721
        // add valid nftx order to planner
        nftxValue = expandTo18DecimalsBN(4)
        numCovens = 2
        const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
          NFTX_COVEN_VAULT_ID,
          numCovens,
          [],
          [WETH.address, NFTX_COVEN_VAULT],
          alice.address,
        ])
        planner.addCommand(CommandType.NFTX, [nftxValue, calldata])

        let invalidSeaportOrder = JSON.parse(JSON.stringify(seaportOrders[0]))
        invalidSeaportOrder.protocol_data.signature = '0xdeadbeef'
        let seaportOrder: Order
        ;({ order: seaportOrder, value: seaportValue } = getOrderParams(invalidSeaportOrder))
        invalidSeaportCalldata = seaportInterface.encodeFunctionData('fulfillOrder', [
          seaportOrder,
          OPENSEA_CONDUIT_KEY,
        ])

        value = seaportValue.add(nftxValue)
      })

      it('reverts if no commands are allowed to revert', async () => {
        planner.addCommand(CommandType.SEAPORT, [seaportValue, invalidSeaportCalldata])

        const { commands, inputs } = planner

        await expect(
          router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
        ).to.be.revertedWith('ExecutionFailed(1, "0x8baa579f")')
      })

      it('does not revert if invalid seaport transaction allowed to fail', async () => {
        planner.addCommand(CommandType.SEAPORT, [seaportValue, invalidSeaportCalldata], true)
        const { commands, inputs } = planner

        const covenBalanceBefore = await covenContract.balanceOf(alice.address)
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
        const covenBalanceAfter = await covenContract.balanceOf(alice.address)
        expect(covenBalanceAfter.sub(covenBalanceBefore)).to.eq(numCovens)
      })
    })

    describe('ERC20 --> NFT', () => {
      let advancedOrder: AdvancedOrder
      let value: BigNumber
      let covenContract: ERC721

      beforeEach(async () => {
        covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice) as ERC721
        ;({ advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0]))
      })

      it('completes a trade for ERC20 --> ETH --> Seaport NFT', async () => {
        const maxAmountIn = expandTo18DecimalsBN(100_000)
        await daiContract.transfer(router.address, maxAmountIn)
        const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
          advancedOrder,
          [],
          OPENSEA_CONDUIT_KEY,
          alice.address,
        ])

        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          value,
          maxAmountIn,
          [DAI.address, WETH.address],
          router.address,
        ])
        planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, value])
        planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
        const { commands, inputs } = planner
        const covenBalanceBefore = await covenContract.balanceOf(alice.address)
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
        const covenBalanceAfter = await covenContract.balanceOf(alice.address)
        expect(covenBalanceAfter.sub(covenBalanceBefore)).to.eq(1)
      })
    })
  })
})
