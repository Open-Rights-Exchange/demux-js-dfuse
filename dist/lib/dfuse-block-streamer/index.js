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
const dfuse_api_1 = require("./dfuse-api");
const apollo_boost_1 = require("apollo-boost");
/**
 * DfuseBlockStreamer connects to the dfuse.io GraphQL API which transmits
 * the transactions that match a query written in SQE (see http://docs.dfuse.io for more information).
 *
 * As it receives transactions, it will group them by block, and send the reconstructed blocks
 * to listeners via a PubSub pattern it implements.
 */
class DfuseBlockStreamer {
    constructor(options) {
        this.listeners = [];
        this.activeCursor = "";
        this.currentBlockNumber = -1;
        this.transactionProcessing = Promise.resolve();
        this.liveMarkerReached = false;
        const { logLevel, lowBlockNum, onlyIrreversible } = options;
        this.log = bunyan_1.createLogger({
            name: "demux-dfuse",
            level: (logLevel || "error")
        });
        this.lowBlockNum = typeof lowBlockNum !== "undefined" ? lowBlockNum : 1;
        this.dfuseApiKey = options.dfuseApiKey;
        this.network = options.network || "mainnet";
        this.query = options.query || "status:executed";
        this.onlyIrreversible = typeof onlyIrreversible !== "undefined" ? onlyIrreversible : false;
        this.log.trace("DfuseBlockStreamer", {
            lowBlockNum: this.lowBlockNum,
            hasDfuseApiKey: !!options.dfuseApiKey,
            network: this.network,
            query: this.query,
            onlyIrreversible: this.onlyIrreversible
        });
    }
    getApolloClient() {
        this.log.trace("DfuseBlockStreamer.getApolloClient()");
        return dfuse_api_1.getApolloClient({
            apiKey: this.dfuseApiKey,
            network: this.network
        });
    }
    /**
     * Starts streams from the dfuse graphql API, calling all
     * registered listeners every time a new block is completed
     */
    stream() {
        this.log.trace("DfuseBlockStreamer.stream()");
        if (!this.apolloClient) {
            this.apolloClient = this.getApolloClient();
        }
        this.getObservableSubscription({
            apolloClient: this.apolloClient
        }).subscribe({
            start: () => {
                this.log.trace("DfuseBlockStreamer GraphQL subscription started");
            },
            next: (value) => {
                this.onTransactionReceived(value.data.searchTransactionsForward);
            },
            error: (error) => {
                // TODO should we be doing anything else?
                this.log.error("DfuseBlockStreamer GraphQL subscription error", error.message);
            },
            complete: () => {
                // TODO: how to handle completion? Will we ever reach completion?
                this.log.error("DfuseBlockStreamer GraphQL subscription completed");
            }
        });
    }
    isLiveMarkerReached() {
        return this.liveMarkerReached;
    }
    onTransactionReceived(transaction) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.trace("DfuseBlockStreamer.onTransactionReceived()");
            const { cursor, undo, trace, irreversibleBlockNum } = transaction;
            /*
             * If trace is null, it means that we received a liveMarker.
             */
            if (!trace) {
                this.log.info("DfuseBlockStreamer: Live marker has been reached.");
                this.liveMarkerReached = true;
                return;
            }
            const { matchingActions, block } = trace;
            const isEarliestBlock = this.currentBlockNumber === -1;
            const isNewBlock = block.num !== this.currentBlockNumber ||
                (this.currentBlock && this.currentBlock.blockMeta.isRollback !== undo);
            /*
             * When we see a transaction belonging to a different block than
             * the previous one, we notify the listeners to the completed block
             */
            if (!isEarliestBlock && isNewBlock) {
                this.currentBlock.blockMeta.isEarliestBlock = typeof this.lastPublishedBlock === "undefined";
                this.notifyListeners(this.currentBlock);
                this.lastPublishedBlock = this.currentBlock;
            }
            /*
             * Create a new current block if necessary
             */
            if (isNewBlock) {
                this.currentBlockNumber = trace.block.num;
                this.currentBlock = {
                    block: {
                        actions: [],
                        blockInfo: {
                            blockNumber: block.num,
                            blockHash: block.id,
                            previousBlockHash: block.previous,
                            timestamp: block.timestamp
                        }
                    },
                    blockMeta: {
                        isRollback: undo,
                        isNewBlock: true,
                        isEarliestBlock: false
                    },
                    lastIrreversibleBlockNumber: irreversibleBlockNum
                };
            }
            /* Insert matching actions into the current block */
            matchingActions.forEach((action) => {
                const { id, account, name, authorization, data } = action;
                this.currentBlock.block.actions.push({
                    type: `${account}::${name}`,
                    payload: {
                        transactionId: id,
                        actionIndex: 0,
                        account,
                        name,
                        authorization,
                        data
                    }
                });
            });
            this.activeCursor = cursor;
        });
    }
    /**
     * Creates and returns an Apollo observable query
     */
    getObservableSubscription(params) {
        const { apolloClient } = params;
        return apolloClient.subscribe({
            query: apollo_boost_1.gql `
        subscription(
          $cursor: String!
          $lowBlockNum: Int64!
          $query: String!
          $onlyIrreversible: Boolean!
        ) {
          searchTransactionsForward(
            query: $query
            cursor: $cursor
            lowBlockNum: $lowBlockNum
            irreversibleOnly: $onlyIrreversible
            liveMarkerInterval: 1000
          ) {
            undo
            irreversibleBlockNum
            trace {
              id
              block {
                num
                id
                previous
                timestamp
              }
              matchingActions {
                account
                name
                data
                authorization {
                  actor
                  permission
                }
              }
            }
          }
        }
      `,
            variables: {
                cursor: this.activeCursor,
                query: this.query,
                onlyIrreversible: this.onlyIrreversible,
                lowBlockNum: this.lowBlockNum
            }
        });
    }
    addOnBlockListener(callback) {
        this.listeners.push(callback);
    }
    removeOnBlockListener(callback) {
        this.listeners = this.listeners.filter((listener) => listener !== callback);
    }
    notifyListeners(nextBlock) {
        this.listeners.forEach((listener) => listener(nextBlock));
    }
}
exports.DfuseBlockStreamer = DfuseBlockStreamer;
//# sourceMappingURL=index.js.map