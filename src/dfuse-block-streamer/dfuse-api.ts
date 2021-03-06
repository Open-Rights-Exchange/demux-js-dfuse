import Logger, { createLogger, LogLevel } from "bunyan"
import { createDfuseClient } from "@dfuse/client"
import fetch from "node-fetch"
import WebSocketConnection from "ws"
import { WebSocketLink } from "apollo-link-ws"
import { SubscriptionClient } from "subscriptions-transport-ws"
import { InMemoryCache } from "apollo-boost"
import ApolloClient from "apollo-client/ApolloClient"

const logger = createLogger({
  name: "demux-dfuse",
  level: "error"
})

function getDfuseClient(apiKey: string, network: string) {
  /*
   * todo: This forcibly configures the client to run on node (with regards to fetch and ws).
   * What if the user wants to run on browser?
   * Also, we may want to allow the user to pass in a dfuse client instance in the constructor?
   */
  return createDfuseClient({
    apiKey,
    network,
    httpClientOptions: {
      fetch
    },
    streamClientOptions: {
      socketOptions: {
        webSocketFactory: async (url: string) => {
          const webSocket = new WebSocketConnection(url, {
            handshakeTimeout: 30 * 1000, // 30s
            maxPayload: 200 * 1024 * 1000 * 1000 // 200Mb
          })

          const onUpgrade = () => {
            webSocket.removeListener("upgrade", onUpgrade)
          }

          webSocket.on("upgrade", onUpgrade)

          return webSocket
        }
      }
    }
  })
}

type getApolloClientParams = {
  apiKey: string
  network: string
}

export function getApolloClient(params: getApolloClientParams) {
  const { apiKey, network } = params
  const dfuseClient = getDfuseClient(apiKey, network)

  const subscriptionClient = new SubscriptionClient(
    dfuseClient.endpoints.graphqlStreamUrl,
    {
      reconnect: true,
      connectionCallback: (error?: any) => {
        if (error) {
          console.log("Apollo client unable to correctly initialize connection", error)
          process.exit(1)
        }
      },
      connectionParams: async () => {
        const { token } = await dfuseClient.getTokenInfo()

        return {
          Authorization: `Bearer ${token}`
        }
      }
    },
    WebSocketConnection
  )

  // TODO: how should this be handled?
  subscriptionClient.onConnecting(() => {
    logger.trace("Connecting")
  })
  subscriptionClient.onConnected(() => {
    logger.trace("Connected")
  })
  subscriptionClient.onReconnecting(() => {
    logger.trace("Reconnecting")
  })
  subscriptionClient.onReconnected(() => {
    logger.trace("Reconnected")
  })
  subscriptionClient.onDisconnected(() => {
    logger.trace("Disconnected")
  })
  subscriptionClient.onError((error) => {
    logger.error("Apollo Subscription Error", error.message)
  })

  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new WebSocketLink(subscriptionClient)
  })
}
