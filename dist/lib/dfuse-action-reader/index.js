"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const bunyan_1 = require("bunyan");
const dfuse_block_streamer_1 = require("../dfuse-block-streamer");
const util_1 = require("../util");
/**
 * Implements a demux-js ActionReader (see https://github.com/EOSIO/demux-js for more information).
 *
 * Demux-js makes the assumption that all blocks need to be read. This would be true if reading directly
 * from an eos node, but it is not the case when using dfuse. Based on the provided query, dfuse will
 * return only the transactions that match the query. This means that blocks that don't interest us will
 * be missing.
 *
 * Because demux-js needs to see every block one by one, when a block that didn't match the dfuse query is
 * required, we generate dummy blocks that contains no actions to get demux-js to move forward to the
 * next block in the chain.
 *
 * Since we only actually fetch the blocks that interest us, we can see great performance gains.
 *
 * demux-js also expects blocks to be fetched one by one, making one network request per block. With dfuse,
 * this is is not necessary, since we can stream only the blocks we want via the graphl api. To circumvent this
 * expectation, the streamed blocks will be put in a FIFO queue, where demux can find them.
 */
class DfuseActionReader {
    constructor(options) {
        this.headBlockNumber = 0;
        this.activeCursor = "";
        this.blockQueue = [];
        this.maxBlockQueueLength = 200;
        this.currentBlockData = defaultBlock;
        this.lastIrreversibleBlockNumber = 0;
        this.initialized = false;
        this.nextBlockNeeded = 0;
        const optionsWithDefaults = Object.assign({ startAtBlock: 1, onlyIrreversible: false, logLevel: "debug" }, options);
        this.startAtBlock = optionsWithDefaults.startAtBlock;
        this.currentBlockNumber = optionsWithDefaults.startAtBlock - 1;
        this.onlyIrreversible = optionsWithDefaults.onlyIrreversible;
        this.log = bunyan_1.createLogger({
            name: "demux-dfuse",
            level: optionsWithDefaults.logLevel
        });
        const { dfuseApiKey, network, query } = optionsWithDefaults;
        this.blockStreamer = new dfuse_block_streamer_1.DfuseBlockStreamer({
            dfuseApiKey,
            network,
            query,
            onlyIrreversible: this.onlyIrreversible,
            lowBlockNum: this.startAtBlock,
            fetchPolicy: optionsWithDefaults.fetchPolicy,
        });
        this.onBlock = this.onBlock.bind(this);
        this.streamBlocks();
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            yield util_1.waitUntil(() => this.blockQueue.length > 0);
            /*
             * If current block number is a negative int, we need to
             * set it to the number of the first block dfuse returns
             */
            if (this.currentBlockNumber < 0) {
                this.currentBlockNumber = util_1.getBlockNumber(this.blockQueue[0]) - 1;
            }
            this.nextBlockNeeded = util_1.getBlockNumber(this.blockQueue[0]);
            this.initialized = true;
        });
    }
    streamBlocks() {
        return __awaiter(this, void 0, void 0, function* () {
            this.blockStreamer.addOnBlockListener(this.onBlock);
            this.blockStreamer.stream();
        });
    }
    onBlock(nextBlock) {
        this.log.trace(`Adding block #${util_1.getBlockNumber(nextBlock)} to the queue.`);
        let nextHeadBlockNumber = util_1.getBlockNumber(nextBlock);
        /*
         * If we haven't reached the live marker yet, make sure we don't let the actionWatcher
         * think it reached the head. Because dfuse does not give us the head block number when
         * streaming blocks, but rather a live marker, the synchronous nature of
         * actionWatcher.checkForBlocks can sometimes trick itself into thinking it reached the
         * head because it processed blocks faster than the API could return them.
         */
        if (!this.blockStreamer.isLiveMarkerReached()) {
            nextHeadBlockNumber++;
        }
        /*
         * When we are seeing a new block, we need to update our head reference
         * Math.max is used in case an "undo" trx is returned, with a lower block
         * number than our head reference. If there was a fork, the head block
         * must be higher than the head block we have previously seen due to the
         * longest chain prevailing in case of a fork
         */
        this.headBlockNumber = Math.max(this.headBlockNumber, nextHeadBlockNumber);
        /*
         * Update the reference to the last irreversible block number,
         * making sure we are not receiving an outdated reference in the case of an undo
         ? is this possible?
         */
        this.lastIrreversibleBlockNumber = Math.max(this.lastIrreversibleBlockNumber, nextBlock.lastIrreversibleBlockNumber);
        this.blockQueue.push(nextBlock);
        if (this.blockQueue.length > this.maxBlockQueueLength) {
            this.blockQueue.pop();
        }
    }
    getBlock(requestedBlockNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            return defaultBlock;
        });
    }
    seekToBlock(blockNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            this.nextBlockNeeded = blockNumber;
        });
    }
    getNextBlock() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.trace("getNextBlock() called. queue length:", this.blockQueue.length);
            // If the queue is empty, wait for graphql to return new results.
            yield util_1.waitUntil(() => {
                return this.blockQueue.length > 0;
            });
            if (!this.initialized) {
                yield this.initialize();
            }
            let nextBlock;
            const queuedBlockNumber = util_1.getBlockNumber(this.blockQueue[0]);
            this.log.trace(`
      DfuseActionReader.getNextBlock()
      Next block needed: ${this.nextBlockNeeded}
      Queued block: ${queuedBlockNumber}
      Block distance: ${queuedBlockNumber - this.nextBlockNeeded}
    `);
            // If the block we need is higher than the queued block, shift the queue
            while (this.blockQueue.length > 0 && this.nextBlockNeeded > queuedBlockNumber) {
                this.log.trace("getNextBlock: nextBlockNeeded is higher than the queued block. Shifting queue.");
                this.blockQueue.shift();
            }
            // If the queued block is the one we need, return it
            if (this.nextBlockNeeded === queuedBlockNumber) {
                this.log.trace(`getNextBlock: ${this.nextBlockNeeded} found at the start of the queue.`);
                /*
                 * Hack to make the block's previousHash property match the previous block,
                 * if the previous block wasnt returned by dfuse and we had to return a generic block
                 * todo is there a better solution than this?
                 */
                nextBlock = this.blockQueue.shift();
                // nextBlock.block.blockInfo.previousBlockHash = this.currentBlockData
                //   ? this.currentBlockData.blockInfo.blockHash
                //   : "dummy-block-hash"
                this.acceptBlock(nextBlock.block);
            }
            else if (this.nextBlockNeeded < queuedBlockNumber) {
                // If the next block we need is lower than the queued block, return a dummy block
                nextBlock = {
                    block: this.getDefaultBlock({
                        blockNumber: this.nextBlockNeeded,
                        previousBlockHash: this.currentBlockData ? this.currentBlockData.blockInfo.blockHash : ""
                    }),
                    blockMeta: {
                        isRollback: false,
                        isEarliestBlock: false,
                        isNewBlock: true
                    },
                    lastIrreversibleBlockNumber: this.lastIrreversibleBlockNumber
                };
                this.acceptBlock(nextBlock.block);
            }
            // In most cases, this.nextBlockNeeded will be set by the ActionWatch directly.
            // However, there are some cases (on the very first block received), where it doesn't.
            // This patches the problem by forcibly moving to the next block as a default.
            this.nextBlockNeeded++;
            return nextBlock;
        });
    }
    getHeadBlockNumber() {
        return __awaiter(this, void 0, void 0, function* () {
            yield util_1.waitUntil(() => this.headBlockNumber !== 0);
            return this.headBlockNumber;
        });
    }
    getLastIrreversibleBlockNumber() {
        return __awaiter(this, void 0, void 0, function* () {
            yield util_1.waitUntil(() => this.lastIrreversibleBlockNumber !== 0);
            return this.lastIrreversibleBlockNumber;
        });
    }
    getDefaultBlock(blockInfo) {
        return {
            blockInfo: Object.assign({}, defaultBlock.blockInfo, blockInfo),
            actions: []
        };
    }
    get info() {
        return {
            currentBlockNumber: this.currentBlockNumber,
            startAtBlock: this.startAtBlock,
            headBlockNumber: this.headBlockNumber,
            onlyIrreversible: this.onlyIrreversible,
            lastIrreversibleBlockNumber: this.lastIrreversibleBlockNumber
        };
    }
    acceptBlock(blockData) {
        this.currentBlockData = blockData;
        this.currentBlockNumber = this.currentBlockData.blockInfo.blockNumber;
    }
}
exports.DfuseActionReader = DfuseActionReader;
const defaultBlock = {
    blockInfo: {
        blockNumber: 0,
        blockHash: "",
        previousBlockHash: "",
        timestamp: new Date(0)
    },
    actions: []
};
//# sourceMappingURL=index.js.map