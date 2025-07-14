import * as vscode from 'vscode';
import { PriceData } from './WebSocketManager';

export class StatusBarTicker implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private priceData: Map<string, PriceData> = new Map();
    private tickerInterval: NodeJS.Timeout | undefined;
    private readonly updateInterval = 1500; // Update every 1.5 seconds for smoother scrolling
    private displaySymbols: string[] = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT']; // Configurable display symbols
    private scrollPosition = 0;
    private readonly maxDisplayLength = 80; // Maximum characters to display in status bar
    private tickerText = '';
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;

        // Load saved display symbols or use defaults
        this.loadDisplaySymbols();

        // Create status bar item with high priority to appear on the left
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            1000
        );

        this.statusBarItem.command = 'cryptop.openPanel';
        this.statusBarItem.tooltip = 'Click to open CryptoP panel - Real-time cryptocurrency prices';
        this.statusBarItem.show();

        this.startTicker();
    }

    private loadDisplaySymbols(): void {
        const saved = this.context.globalState.get<string[]>('cryptop.statusBarSymbols');
        if (saved && saved.length > 0) {
            this.displaySymbols = saved;
        }
    }

    public setDisplaySymbols(symbols: string[]): void {
        this.displaySymbols = symbols;
        this.context.globalState.update('cryptop.statusBarSymbols', symbols);
        this.buildTickerText();
    }

    public getDisplaySymbols(): string[] {
        return [...this.displaySymbols];
    }

    public updatePrice(data: PriceData): void {
        // Only show data for configured display symbols to avoid clutter
        if (this.displaySymbols.includes(data.symbol)) {
            console.log(`StatusBarTicker: Updating price for ${data.symbol}: ${data.price}`);
            this.priceData.set(data.symbol, data);
            this.buildTickerText();
        }
    }

    private buildTickerText(): void {
        const prices = Array.from(this.priceData.values());
        if (prices.length === 0) {
            this.tickerText = 'CryptoP: Connecting...';
            return;
        }

        // Sort by symbol for consistent order
        prices.sort((a, b) => a.symbol.localeCompare(b.symbol));

        // Build continuous ticker text
        const priceStrings = prices.map(data => {
            const changeIcon = data.priceChange >= 0 ? '↗' : '↘';
            const formattedPrice = this.formatPrice(parseFloat(data.price));
            const formattedChange = data.priceChange.toFixed(2);
            return `${data.symbol}: $${formattedPrice} ${changeIcon}${formattedChange}%`;
        });

        this.tickerText = priceStrings.join('  •  ') + '  •  ';
    }

    private startTicker(): void {
        this.updateDisplay();

        this.tickerInterval = setInterval(() => {
            this.updateDisplay();
        }, this.updateInterval);
    }

    private updateDisplay(): void {
        if (this.tickerText.length === 0) {
            this.statusBarItem.text = '$(graph) CryptoP: Connecting...';
            return;
        }

        // Create scrolling effect
        const displayText = this.getScrollingText();
        this.statusBarItem.text = `$(graph) ${displayText}`;

        // Update tooltip with all current prices
        this.updateTooltip();

        // Advance scroll position
        this.scrollPosition = (this.scrollPosition + 1) % this.tickerText.length;
    }

    private getScrollingText(): string {
        if (this.tickerText.length <= this.maxDisplayLength) {
            return this.tickerText;
        }

        // Create seamless scrolling by repeating the text
        const doubleText = this.tickerText + this.tickerText;
        const startPos = this.scrollPosition;
        const endPos = startPos + this.maxDisplayLength;

        return doubleText.substring(startPos, endPos);
    }

    private updateTooltip(): void {
        const prices = Array.from(this.priceData.values());
        if (prices.length === 0) {
            this.statusBarItem.tooltip = 'Click to open CryptoP panel';
            return;
        }

        const tooltipLines = prices.map(data => {
            const formattedPrice = this.formatPrice(parseFloat(data.price));
            const formattedChange = data.priceChange.toFixed(2);
            const changeSymbol = data.priceChange >= 0 ? '+' : '';
            return `${data.symbol}: $${formattedPrice} (${changeSymbol}${formattedChange}%)`;
        });

        this.statusBarItem.tooltip = `Real-time Crypto Prices:\n${tooltipLines.join('\n')}\n\nClick to open CryptoP panel for more details`;
    }

    private formatPrice(price: number): string {
        if (price >= 1000) {
            return price.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else if (price >= 1) {
            return price.toFixed(4);
        } else {
            return price.toFixed(6);
        }
    }

    public dispose(): void {
        if (this.tickerInterval) {
            clearInterval(this.tickerInterval);
        }
        this.statusBarItem.dispose();
    }
}
