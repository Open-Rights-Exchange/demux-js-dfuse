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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bunyan_1 = require("bunyan");
const client_1 = require("@dfuse/client");
const node_fetch_1 = __importDefault(require("node-fetch"));
const ws_1 = __importDefault(require("ws"));
const apollo_link_ws_1 = require("apollo-link-ws");
const subscriptions_transport_ws_1 = require("subscriptions-transport-ws");
const apollo_boost_1 = require("apollo-boost");
const ApolloClient_1 = __importDefault(require("apollo-client/ApolloClient"));
const logger = bunyan_1.createLogger({
    name: "demux-dfuse",
    level: "error"
});
function getDfuseClient(apiKey, network) {
    /*
     * todo: This forcibly configures the client to run on node (with regards to fetch and ws).
     * What if the user wants to run on browser?
     * Also, we may want to allow the user to pass in a dfuse client instance in the constructor?
     */
    return client_1.createDfuseClient({
        apiKey,
        network,
        httpClientOptions: {
            fetch: node_fetch_1.default
        },
        streamClientOptions: {
            socketOptions: {
                webSocketFactory: (url) => __awaiter(this, void 0, void 0, function* () {
                    const webSocket = new ws_1.default(url, {
                        handshakeTimeout: 30 * 1000,
                        maxPayload: 200 * 1024 * 1000 * 1000 // 200Mb
                    });
                    const onUpgrade = () => {
                        webSocket.removeListener("upgrade", onUpgrade);
                    };
                    webSocket.on("upgrade", onUpgrade);
                    return webSocket;
                })
            }
        }
    });
}
function getApolloClient(params) {
    const { apiKey, network } = params;
    const dfuseClient = getDfuseClient(apiKey, network);
    const subscriptionClient = new subscriptions_transport_ws_1.SubscriptionClient(dfuseClient.endpoints.graphqlStreamUrl, {
        reconnect: true,
        connectionCallback: (error) => {
            if (error) {
                console.log("Apollo client unable to correctly initialize connection", error);
                process.exit(1);
            }
        },
        connectionParams: () => __awaiter(this, void 0, void 0, function* () {
            const { token } = yield dfuseClient.getTokenInfo();
            return {
                Authorization: `Bearer ${token}`
            };
        })
    }, ws_1.default);
    // TODO: how should this be handled?
    subscriptionClient.onConnecting(() => {
        logger.trace("Connecting");
    });
    subscriptionClient.onConnected(() => {
        logger.trace("Connected");
    });
    subscriptionClient.onReconnecting(() => {
        logger.trace("Reconnecting");
    });
    subscriptionClient.onReconnected(() => {
        logger.trace("Reconnected");
    });
    subscriptionClient.onDisconnected(() => {
        logger.trace("Disconnected");
    });
    subscriptionClient.onError((error) => {
        logger.error("Apollo Subscription Error", error.message);
    });
    return new ApolloClient_1.default({
        cache: new apollo_boost_1.InMemoryCache(),
        link: new apollo_link_ws_1.WebSocketLink(subscriptionClient)
    });
}
exports.getApolloClient = getApolloClient;
//# sourceMappingURL=dfuse-api.js.map