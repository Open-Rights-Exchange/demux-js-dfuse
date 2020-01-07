import { FetchPolicy } from "apollo-client";
import { ActionReader, ActionReaderOptions, Block, BlockInfo, NextBlock, ReaderInfo } from "demux";
import { DfuseBlockStreamer } from "../dfuse-block-streamer";
declare type DfuseActionReaderOptions = ActionReaderOptions & {
    dfuseApiKey: string;
    network?: string;
    query?: string;
    maxBlockQueueLength?: number;
    fetchPolicy: FetchPolicy;
};
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
export declare class DfuseActionReader implements ActionReader {
    startAtBlock: number;
    headBlockNumber: number;
    currentBlockNumber: number;
    protected activeCursor: string;
    protected blockQueue: NextBlock[];
    protected maxBlockQueueLength: number;
    protected blockStreamer: DfuseBlockStreamer;
    protected onlyIrreversible: boolean;
    protected currentBlockData: Block;
    protected lastIrreversibleBlockNumber: number;
    protected initialized: boolean;
    private nextBlockNeeded;
    private log;
    constructor(options: DfuseActionReaderOptions);
    initialize(): Promise<void>;
    private streamBlocks;
    private onBlock;
    getBlock(requestedBlockNumber: number): Promise<Block>;
    seekToBlock(blockNumber: number): Promise<void>;
    getNextBlock(): Promise<NextBlock>;
    getHeadBlockNumber(): Promise<number>;
    getLastIrreversibleBlockNumber(): Promise<number>;
    protected getDefaultBlock(blockInfo: Partial<BlockInfo>): Block;
    get info(): ReaderInfo;
    private acceptBlock;
}
export {};
