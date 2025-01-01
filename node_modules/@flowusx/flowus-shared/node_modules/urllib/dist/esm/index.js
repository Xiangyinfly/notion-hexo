import LRU from 'ylru';
import { HttpClient, HEADER_USER_AGENT } from './HttpClient.js';
let httpClient;
const domainSocketHttpClients = new LRU(50);
export function getDefaultHttpClient() {
    if (!httpClient) {
        httpClient = new HttpClient();
    }
    return httpClient;
}
export async function request(url, options) {
    if (options?.socketPath) {
        let domainSocketHttpclient = domainSocketHttpClients.get(options.socketPath);
        if (!domainSocketHttpclient) {
            domainSocketHttpclient = new HttpClient({
                connect: { socketPath: options.socketPath },
            });
            domainSocketHttpClients.set(options.socketPath, domainSocketHttpclient);
        }
        return await domainSocketHttpclient.request(url, options);
    }
    return await getDefaultHttpClient().request(url, options);
}
// export curl method is keep compatible with urllib.curl()
// ```ts
// import * as urllib from 'urllib';
// urllib.curl(url);
// ```
export async function curl(url, options) {
    return await request(url, options);
}
export { MockAgent, ProxyAgent, Agent, Dispatcher, setGlobalDispatcher, getGlobalDispatcher, } from 'undici';
// HttpClient2 is keep compatible with urllib@2 HttpClient2
export { HttpClient, HttpClient as HttpClient2, HEADER_USER_AGENT as USER_AGENT, } from './HttpClient.js';
export * from './HttpClientError.js';
export default {
    request,
    curl,
    USER_AGENT: HEADER_USER_AGENT,
};
