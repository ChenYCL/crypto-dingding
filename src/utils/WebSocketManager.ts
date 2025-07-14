import WebSocket from 'ws';

export interface PriceData {
    symbol: string;
    price: string;
    priceChange: number;
    type: 'spot' | 'futures';
}

export class WebSocketManager {
    private spotWs: WebSocket | null = null;
    private futuresWs: WebSocket | null = null;
    private subscriptions: Set<string> = new Set();
    private priceUpdateCallbacks: ((data: PriceData) => void)[] = [];
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 5000;
    private priceAlertCallback: ((symbol: string, price: number) => void) | null = null;

    constructor() {
        this.setupHeartbeat();
    }

    public connect(): void {
        this.connectSpot();
        this.connectFutures();
    }

    private connectSpot(): void {
        try {
            this.spotWs = new WebSocket('wss://stream.binance.com:9443/ws/!ticker@arr');

            if (this.spotWs) {
                this.spotWs.on('open', () => {
                    console.log('现货WebSocket连接已建立');
                    this.reconnectAttempts = 0;
                });

                this.spotWs.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        if (Array.isArray(message)) {
                            message.forEach((ticker: any) => {
                                if (this.subscriptions.has(ticker.s)) {
                                    this.notifyPriceUpdate({
                                        symbol: ticker.s,
                                        price: parseFloat(ticker.c).toFixed(8),
                                        priceChange: parseFloat(ticker.P),
                                        type: 'spot'
                                    });
                                }
                            });
                        }
                    } catch (error) {
                        console.error('解析现货数据失败:', error);
                    }
                });

                this.spotWs.on('error', (error: Error) => {
                    console.error('现货WebSocket错误:', error);
                    this.reconnectSpot();
                });

                this.spotWs.on('close', () => {
                    console.log('现货WebSocket连接已关闭');
                    this.reconnectSpot();
                });
            }
        } catch (error) {
            console.error('现货WebSocket连接失败:', error);
            this.reconnectSpot();
        }
    }

    private connectFutures(): void {
        try {
            this.futuresWs = new WebSocket('wss://fstream.binance.com/ws/!ticker@arr');

            if (this.futuresWs) {
                this.futuresWs.on('open', () => {
                    console.log('期货WebSocket连接已建立');
                    this.reconnectAttempts = 0;
                });

                this.futuresWs.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        if (Array.isArray(message)) {
                            message.forEach((ticker: any) => {
                                if (this.subscriptions.has(ticker.s)) {
                                    this.notifyPriceUpdate({
                                        symbol: ticker.s,
                                        price: parseFloat(ticker.c).toFixed(8),
                                        priceChange: parseFloat(ticker.P),
                                        type: 'futures'
                                    });
                                }
                            });
                        }
                    } catch (error) {
                        console.error('解析期货数据失败:', error);
                    }
                });

                this.futuresWs.on('error', (error: Error) => {
                    console.error('期货WebSocket错误:', error);
                    this.reconnectFutures();
                });

                this.futuresWs.on('close', () => {
                    console.log('期货WebSocket连接已关闭');
                    this.reconnectFutures();
                });
            }
        } catch (error) {
            console.error('期货WebSocket连接失败:', error);
            this.reconnectFutures();
        }
    }

    private reconnectSpot(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重连现货WebSocket，第 ${this.reconnectAttempts} 次`);
            setTimeout(() => {
                this.connectSpot();
            }, this.reconnectDelay);
        } else {
            console.error('现货WebSocket重连失败，已达到最大重试次数');
        }
    }

    private reconnectFutures(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重连期货WebSocket，第 ${this.reconnectAttempts} 次`);
            setTimeout(() => {
                this.connectFutures();
            }, this.reconnectDelay);
        } else {
            console.error('期货WebSocket重连失败，已达到最大重试次数');
        }
    }

    public subscribe(symbol: string, type: 'spot' | 'futures'): void {
        this.subscriptions.add(symbol);
        console.log(`已订阅 ${symbol} (${type})`);
    }

    public unsubscribe(symbol: string): void {
        this.subscriptions.delete(symbol);
        console.log(`已取消订阅 ${symbol}`);
    }

    public onPriceUpdate(callback: (data: PriceData) => void): void {
        this.priceUpdateCallbacks.push(callback);
    }

    public onPriceAlert(callback: (symbol: string, price: number) => void): void {
        this.priceAlertCallback = callback;
    }

    private notifyPriceUpdate(data: PriceData): void {
        this.priceUpdateCallbacks.forEach(callback => callback(data));

        // 触发价格提醒检查
        if (this.priceAlertCallback) {
            const price = parseFloat(data.price);
            this.priceAlertCallback(data.symbol, price);
        }
    }

    private setupHeartbeat(): void {
        setInterval(() => {
            if (this.spotWs && this.spotWs.readyState === WebSocket.OPEN) {
                this.spotWs.ping();
            }
            if (this.futuresWs && this.futuresWs.readyState === WebSocket.OPEN) {
                this.futuresWs.ping();
            }
        }, 30000); // 每30秒发送心跳
    }

    public disconnect(): void {
        if (this.spotWs) {
            this.spotWs.close();
            this.spotWs = null;
        }
        if (this.futuresWs) {
            this.futuresWs.close();
            this.futuresWs = null;
        }
        this.subscriptions.clear();
        this.priceUpdateCallbacks = [];
        console.log('WebSocket连接已断开');
    }

    public dispose(): void {
        this.disconnect();
    }
} 