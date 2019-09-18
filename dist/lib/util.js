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
const client_1 = require("@dfuse/client");
/*
 * Loop on a condition, resolving the returned promise once the condition is met
 */
function waitUntil(condition, timeout = 125) {
    return __awaiter(this, void 0, void 0, function* () {
        while (condition() === false) {
            yield client_1.waitFor(timeout);
        }
    });
}
exports.waitUntil = waitUntil;
function getPreviousBlockHash(nextBlock) {
    return nextBlock.block.blockInfo.previousBlockHash;
}
exports.getPreviousBlockHash = getPreviousBlockHash;
function getBlockHash(nextBlock) {
    return nextBlock.block.blockInfo.blockHash;
}
exports.getBlockHash = getBlockHash;
function getBlockNumber(nextBlock) {
    return nextBlock.block.blockInfo.blockNumber;
}
exports.getBlockNumber = getBlockNumber;
//# sourceMappingURL=util.js.map