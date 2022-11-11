/**
 * @see https://janus.conf.meetecho.com/docs/textroom.html
 */

import WebRTCAdapter from "webrtc-adapter";
import Janus, { JanusJS } from "./janus";

type Room = {
    "room": number,
    "description": string,
    "pin_required": boolean,
    "num_participants": number
}

type Participant = {
    "username": string,
}

type RoomsListResponse = {
    "textroom": "success",
    "list": Room[]
};

type JoinResponse = {
    "textroom": "success",
    "participants": Participant[]
}

class Textroom { // EventTarget
    private textroom?: JanusJS.PluginHandle;
    private janus?: Janus;
    private transactions: Record<string, (data: any) => void> = {};
    private username: string = '';

    async connect(server: string[]) {
        this.janus = await this.createJanus(server);
        this.textroom = await this.attachTextroomPlugin(this.janus);

        this.username = `user-${this.janus?.getSessionId()}`;
    }

    async roomsList() {
        return new Promise<Room[]>((resolve, reject) => {

            const transaction = Janus.randomString(12);

            this.textroom?.data({
                text: JSON.stringify({
                    textroom: "list",
                    transaction: transaction,
                }),
                error: reject,
                success: () => {
                    this.transactions[transaction] = (data: RoomsListResponse) => resolve(data.list);
                }
            });
        });
    }

    async join(roomId: number) {
        return new Promise<Participant[]>((resolve, reject) => {

            const transaction = Janus.randomString(12);

            this.textroom?.data({
                text: JSON.stringify({
                    "textroom": "join",
                    "room": roomId,
                    "username": this.username,
                    "history": false
                }),
                error: reject,
                success: () => {
                    this.transactions[transaction] = (data: JoinResponse) => resolve(data.participants);
                }
            });
        });


    }

    private createJanus(server: string[]): Promise<Janus> {
        return new Promise<Janus>((resolve, reject) => {
            const janus = new Janus({
                server,
                success: () => resolve(janus),
                error: reject,
                destroyed: () => this.onJanusDestroyed()
            });
        });
    }

    private attachTextroomPlugin(janus: Janus): Promise<JanusJS.PluginHandle> {
        return new Promise<JanusJS.PluginHandle>((resolve, reject) => {
            let textroom: JanusJS.PluginHandle;

            janus.attach({
                plugin: "janus.plugin.textroom",
                success: (pluginHandle) => {
                    textroom = pluginHandle;
                    textroom.send({ message: { request: "setup" } });
                },
                error: reject,
                onmessage: (msg, jsep) => {
                    if (msg["error"]) {
                        reject(msg["error"]);
                        return;
                    }

                    if (jsep) {
                        textroom.createAnswer({
                            jsep: jsep,
                            tracks: [{ type: 'data' }],
                            success: function (jsep: any) {
                                textroom.send({ message: { request: "ack" }, jsep });
                            },
                            error: reject
                        });
                    }
                },
                ondataopen: () => resolve(textroom),
                oncleanup: () => this.onClose(),
                ondetached: () => this.onClose(),
                ondata: (data: any) => this.onData(data)
            });
        });
    }

    private onData(data: any) {
        const json = JSON.parse(data);
        const transaction: string | undefined = json.transaction;
        const action: string = json.textroom;

        console.log(`ondata data ${JSON.stringify(json, null, 2)}`);

        if (transaction) {
            this.transactions[transaction]?.(json);
            delete this.transactions[transaction];

            return;
        }

        if (action === "message") {
            console.log('ondata message', json);

            return;
        }

        if (action === "join") {
            console.log(`Joined ${json.username} ${json.display}`);

            return;
        }

        if (action === "leave") {
            console.log(`Left ${json.username} ${json.display}`);

            return;
        }
    }

    private onJanusDestroyed() {
        console.log('Janus session destroyed');
    }

    private onClose() {
        console.log('WebRTC PeerConnection has been closed or plugin has been detached');
    }
}

// @ts-expect-error
window.Textroom = Textroom;

Janus.init({
    dependencies: Janus.useDefaultDependencies({
        adapter: WebRTCAdapter
    }),
    callback: function () {
        console.log('Janus init OK')
    }
});