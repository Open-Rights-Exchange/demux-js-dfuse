import { NextBlock } from "demux";
export declare function waitUntil(condition: () => boolean, timeout?: number): Promise<void>;
export declare function getPreviousBlockHash(nextBlock: NextBlock): string;
export declare function getBlockHash(nextBlock: NextBlock): string;
export declare function getBlockNumber(nextBlock: NextBlock): number;
