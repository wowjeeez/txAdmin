import {parse, Url} from 'node:url';
import * as http from "node:http"
import * as https from "node:https"
import consoleFactory from '@extras/console';

const console = consoleFactory('LokiTransport');
const FXRT_SCRIPT_RE = /\[\s*script:(.*)\]/
const FX_COMPONENT_RE = /\[\s*(citizen-server-impl|c-scripting-core|resources|TXADMIN|svadhesive)\]/
//https://stackoverflow.com/a/29497680
const ANSI_STRIP_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

const makeHeaders = (len: number, auth: string | null | undefined) => ({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': len,
        ...(auth ? {'Authorization': `Basic ${Buffer.from(auth).toString('base64')}`} : {})
})


const flagMap = {
    global: 'g',
    ignoreCase: 'i',
    multiline: 'm',
    dotAll: 's',
    sticky: 'y',
    unicode: 'u'
}

interface Options {
    source?: string;
    global?: boolean;
    ignoreCase?: boolean;
    multiline?: boolean;
    dotAll?: boolean;
    sticky?: boolean;
    unicode?: boolean;
    lastIndex?: number;
}
// stolen from https://github.com/sindresorhus/clone-regexp/blob/main/index.js
function cloneRegexp(regexp: RegExp, options: Options = {}) {

    const flags = Object.keys(flagMap).map(flag => (
        // @ts-ignore
        (typeof options[flag] === 'boolean' ? options[flag] : regexp[flag]) ? flagMap[flag] : ''
    )).join('');

    const clonedRegexp = new RegExp(options.source || regexp.source, flags);

    clonedRegexp.lastIndex = typeof options.lastIndex === 'number' ?
        options.lastIndex :
        regexp.lastIndex;

    return clonedRegexp;
}



type LokiStream = {
    stream: Record<string, string>,
    values: [string, string][]
}
type LokiPayload = {
    streams: LokiStream[]
}
export class LokiTransport {
    private readonly lokiEndpoint: Url | null = null;
    constructor() {
        const outputUrl = GetConvar('_tx_loki_endpoint', 'none');
        if (outputUrl != 'none') {
            console.warn('You defined the _tx_loki_endpoint convar. This feature is intended for advanced users and no support will be offered for this feature.');
            console.warn('This feature can potentially leak confidential data about your server, use it at your own risk.');
            try {
                this.lokiEndpoint = parse(outputUrl);
                if (this.lokiEndpoint.path !== '/loki/api/v1/push') {
                    throw new Error('Invalid REST path for Loki');
                }
            } catch (err) {
                console.error('Failed to parse Loki connection string, looks like you don\'t know what you are doing. Please turn this feature off by removing the _tx_loki_endpoint convar.');
            }
        }
    }

    public sendStdout(rawLogData: string) {
        if (this.lokiEndpoint === null) return
        const payload = this.process(rawLogData, 'log')
        this.transport(payload)
    }

    public sendStdErr(rawLogData: string) {
        if (this.lokiEndpoint === null) return
        const payload = this.process(rawLogData, 'error')
        this.transport(payload)
    }

    private groupLogLines(lines: string[]) {}

    private transport(payload: LokiPayload) {
        const client = this.lokiEndpoint!.protocol == "https:" ? https : http
        const body = Buffer.from(JSON.stringify(payload))
        const internalPromise = new Promise<string>((resolve, rej) => {
            const req = client.request({
                hostname: this.lokiEndpoint!.hostname,
                port: this.lokiEndpoint!.protocol == "https:" ? 443 : 80,
                path: this.lokiEndpoint!.pathname,
                method: "POST",
                headers: makeHeaders(body.length, this.lokiEndpoint?.auth)
            }, res => {
                let resData = ''
                res.on('data', data => (resData += data))
                res.on('end', () => resolve(resData))
            })
            req.on('error', rej)
            req.write(body)
            req.end()
        })

        internalPromise.catch(err => console.error("Failed to send log to Loki", err))
        internalPromise.then((r) => {
            if (r.trim().length !== 0) {
                console.error(`Failed to send log to Loki`, r)
            }
        })
    }

    private process(log: string, type: 'log' | 'error'): LokiPayload {
        log = log.replace(ANSI_STRIP_RE, '');

        const resourceName = log.match(FXRT_SCRIPT_RE)
        const componentName = log.match(FX_COMPONENT_RE)
        if (!resourceName && !componentName) return this.processRaw(log, type)

        const tags: Record<string, string> = {level: type}
        if (resourceName?.[1]) {
            log = log.replace(resourceName[0], "")
            tags['resource'] = resourceName[1]
        }

        if (componentName?.[1]) {
            log = log.replace(componentName[0], "")
            tags['fx_component'] = componentName[1]
        }
        const timeStamp = Date.now() * 1000000; // loki expects a timestamp in ns
        const lines = log.split('\n').map(x => x.trim())
        return {
            streams: [
                {
                    stream: tags,
                    values: lines.map(line => [timeStamp.toString(), this.sanitize(line)])
                }
            ]
        }
    }

    private processRaw(log: string, type: 'log' | 'error'): LokiPayload {
        const lines = log.split('\n').map(x => x.trim())
        const timeStamp = Date.now() * 1000000; // loki expects a timestamp in ns
        return {
            streams: [
                {
                    stream: {raw: 'true', level: type},
                    values: lines.map(line => [timeStamp.toString(), this.sanitize(line)])
                }
            ]
        }
    }

    private sanitize(line: string) {
        return line
            .replace(cloneRegexp(FXRT_SCRIPT_RE, {global: true}), "")
            .replace(cloneRegexp(FX_COMPONENT_RE, {global: true}), "")
            .replace(cloneRegexp(ANSI_STRIP_RE, {global: true}), "")
    }


}