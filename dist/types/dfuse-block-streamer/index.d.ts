import { LogLevel } from "bunyan";
import { NextBlock } from "demux";
import ApolloClient, { FetchPolicy } from "apollo-client";
export declare type DfuseBlockStreamerOptions = {
    dfuseApiKey: string;
    network?: string;
    lowBlockNum?: number;
    query?: string;
    onlyIrreversible: boolean;
    logLevel?: LogLevel;
    fetchPolicy?: FetchPolicy;
};
declare type OnBlockListener = (nextBlock: NextBlock) => void;
/**
 * DfuseBlockStreamer connects to the dfuse.io GraphQL API which transmits
 * the transactions that match a query written in SQE (see http://docs.dfuse.io for more information).
 *
 * As it receives transactions, it will group them by block, and send the reconstructed blocks
 * to listeners via a PubSub pattern it implements.
 */
export declare class DfuseBlockStreamer {
    private log;
    private dfuseApiKey;
    private network;
    private query;
    private apolloClient?;
    private listeners;
    private activeCursor;
    private lowBlockNum;
    private currentBlockNumber;
    private onlyIrreversible;
    private currentBlock?;
    private lastPublishedBlock?;
    private transactionProcessing;
    private liveMarkerReached;
    private fetchPolicy;
    constructor(options: DfuseBlockStreamerOptions);
    protected getApolloClient(): ApolloClient<import("apollo-boost").NormalizedCacheObject>;
    /**
     * Starts streams from the dfuse graphql API, calling all
     * registered listeners every time a new block is completed
     */
    stream(): void;
    isLiveMarkerReached(): boolean;
    private onTransactionReceived;
    /**
     * Creates and returns an Apollo observable query
     */
    private getObservableSubscription;
    addOnBlockListener(callback: OnBlockListener): void;
    removeOnBlockListener(callback: OnBlockListener): void;
    private notifyListeners;
}
export {};
