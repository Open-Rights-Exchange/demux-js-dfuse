import ApolloClient from "apollo-client/ApolloClient";
declare type getApolloClientParams = {
    apiKey: string;
    network: string;
};
export declare function getApolloClient(params: getApolloClientParams): ApolloClient<import("apollo-boost").NormalizedCacheObject>;
export {};
