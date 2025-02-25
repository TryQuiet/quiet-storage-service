import { Test } from '@nestjs/testing';
import { TestUtils } from '../../utils/test-utils.js';
import { WebsocketModule } from '../../../src/nest/websocket/ws.module.js';
import { DateTime } from 'luxon';
import { Ping, Pong } from '../../../src/nest/websocket/handlers/types.js';
import { WebsocketEvents } from '../../../src/nest/websocket/ws.types.js';
import { Logger } from '@nestjs/common';
import { WsResponse } from '@nestjs/websockets';
import { TestSockets } from '../../utils/types.js';

describe('Ping', () => {
    let sockets: TestSockets
    let logger: Logger

    beforeEach(async () => {
        const testingModule = await Test.createTestingModule({
            imports: [WebsocketModule],
        }).compile();

        await TestUtils.startServer(testingModule);
        logger = new Logger('E2E:Websocket:Ping')
        // each test need a new socket connection
        sockets = await TestUtils.createSocket();
    });

    beforeEach(() => {
        logger.debug(`###### ${expect.getState().currentTestName}`)
    })

    afterEach(async () => {
        // each test need to release the connection for next
        await TestUtils.close();
    });

    describe('should handle outgoing pings', () => {
        it('should send ping', (done) => {
            sockets.client.on(WebsocketEvents.PING, (payload: Ping) => {
                try {
                    expect(payload).toEqual(expect.objectContaining({ ts: expect.any(Number)}))
                } finally {
                    done()
                }
            });
            
            sockets.server.emit(WebsocketEvents.PING, { ts: DateTime.utc().toMillis() });
        });
    });

    describe('should handle incoming pings', () => {
        it('should emit a valid pong when ping is valid', async () => {
            const response = await sockets.client.emitWithAck(WebsocketEvents.PING, { ts: DateTime.utc().toMillis() }) as WsResponse<Pong>;
            expect(response.event).toBe(WebsocketEvents.PONG)
            expect(response.data).toEqual(expect.objectContaining({ success:true, ts: expect.any(Number)}))
        });
    });
});