import * as vscode from 'vscode';
import { PriceData } from '../utils/WebSocketManager';

export class CryptoPriceItem extends vscode.TreeItem {
    constructor(
        public readonly symbol: string,
        public readonly price: string,
        public readonly priceChange: number,
        public readonly type: 'spot' | 'futures',
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(symbol, collapsibleState);

        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.iconPath = this.getIcon();
        this.contextValue = 'cryptoPrice';

        // Add command to open panel when clicked
        this.command = {
            command: 'cryptop.openPanel',
            title: 'Open CryptoP Panel',
            arguments: [symbol]
        };
    }

    private getTooltip(): string {
        const changeText = this.priceChange >= 0 ? `+${this.priceChange.toFixed(2)}%` : `${this.priceChange.toFixed(2)}%`;
        const marketType = this.type === 'spot' ? 'Spot Market' : 'Futures Market';
        const volatilityLevel = Math.abs(this.priceChange) > 5 ? 'High Volatility' :
            Math.abs(this.priceChange) > 2 ? 'Medium Volatility' : 'Low Volatility';

        return `${this.symbol} (${marketType})\nPrice: $${this.price}\nChange: ${changeText}\nVolatility: ${volatilityLevel}\n\nClick to open CryptoP panel`;
    }

    private getDescription(): string {
        const formattedPrice = this.formatPrice(parseFloat(this.price));
        const changeText = this.priceChange >= 0 ? `+${this.priceChange.toFixed(2)}%` : `${this.priceChange.toFixed(2)}%`;

        // Add visual indicators for better readability
        const trendEmoji = this.priceChange >= 0 ? '📈' : '📉';
        const cleanSymbol = this.symbol.replace('USDT', ''); // Remove USDT for cleaner display

        return `$${formattedPrice} ${trendEmoji} ${changeText}`;
    }

    private getIcon(): vscode.ThemeIcon {
        const absChange = Math.abs(this.priceChange);

        // Different icons based on volatility and direction
        if (absChange > 5) {
            // High volatility - use more dramatic icons
            return new vscode.ThemeIcon(
                this.priceChange >= 0 ? 'rocket' : 'flame',
                new vscode.ThemeColor(this.priceChange >= 0 ? 'charts.green' : 'charts.red')
            );
        } else if (absChange > 2) {
            // Medium volatility - use trending icons
            return new vscode.ThemeIcon(
                this.priceChange >= 0 ? 'trending-up' : 'trending-down',
                new vscode.ThemeColor(this.priceChange >= 0 ? 'charts.green' : 'charts.red')
            );
        } else if (absChange > 0.1) {
            // Low volatility - use arrow icons
            return new vscode.ThemeIcon(
                this.priceChange >= 0 ? 'arrow-up' : 'arrow-down',
                new vscode.ThemeColor(this.priceChange >= 0 ? 'charts.green' : 'charts.red')
            );
        } else {
            // Very low volatility - use neutral icon
            return new vscode.ThemeIcon('dash', new vscode.ThemeColor('foreground'));
        }
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
}

export class CryptoPriceTreeProvider implements vscode.TreeDataProvider<CryptoPriceItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CryptoPriceItem | undefined | null | void> = new vscode.EventEmitter<CryptoPriceItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CryptoPriceItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private priceData: Map<string, PriceData> = new Map();
    private spotItems: CryptoPriceItem[] = [];
    private futuresItems: CryptoPriceItem[] = [];
    private favoriteItems: CryptoPriceItem[] = [];
    private favorites: Set<string> = new Set();

    constructor(private favoritesManager?: any) {
        if (favoritesManager) {
            this.loadFavorites();
        }
    }

    private async loadFavorites(): Promise<void> {
        if (this.favoritesManager) {
            const favoritesList = await this.favoritesManager.getFavorites();
            this.favorites = new Set(favoritesList);
            this.refreshItems();
        }
    }

    public async updateFavorites(): Promise<void> {
        await this.loadFavorites();
        this._onDidChangeTreeData.fire();
    }

    public updatePrice(data: PriceData): void {
        this.priceData.set(`${data.symbol}-${data.type}`, data);
        this.refreshItems();
        this._onDidChangeTreeData.fire();
    }

    private refreshItems(): void {
        this.spotItems = [];
        this.futuresItems = [];
        this.favoriteItems = [];

        for (const [key, data] of this.priceData) {
            const item = new CryptoPriceItem(
                data.symbol,
                data.price,
                data.priceChange,
                data.type
            );

            if (data.type === 'spot') {
                this.spotItems.push(item);

                // Add to favorites if it's a favorite symbol
                if (this.favorites.has(data.symbol)) {
                    this.favoriteItems.push(item);
                }
            } else {
                this.futuresItems.push(item);
            }
        }

        // Enhanced sorting: first by volatility (high to low), then by symbol name
        const sortByVolatilityAndName = (a: CryptoPriceItem, b: CryptoPriceItem) => {
            const aVolatility = Math.abs(a.priceChange);
            const bVolatility = Math.abs(b.priceChange);

            // Sort by volatility first (descending)
            if (aVolatility !== bVolatility) {
                return bVolatility - aVolatility;
            }

            // Then by symbol name (ascending)
            return a.symbol.localeCompare(b.symbol);
        };

        this.spotItems.sort(sortByVolatilityAndName);
        this.futuresItems.sort(sortByVolatilityAndName);
        this.favoriteItems.sort(sortByVolatilityAndName);
    }

    getTreeItem(element: CryptoPriceItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CryptoPriceItem): Thenable<CryptoPriceItem[]> {
        if (!element) {
            // Return root level items (categories)
            const categories: CryptoPriceItem[] = [];

            // Always show favorites category
            const favoritesCategory = new CryptoPriceItem(
                'My Favorites',
                '',
                0,
                'spot',
                vscode.TreeItemCollapsibleState.Expanded
            );
            favoritesCategory.contextValue = 'category';
            favoritesCategory.command = undefined;
            favoritesCategory.iconPath = new vscode.ThemeIcon('star-full');

            if (this.favoriteItems.length > 0) {
                // Add summary information to category description
                const gainers = this.favoriteItems.filter(item => item.priceChange > 0).length;
                const losers = this.favoriteItems.filter(item => item.priceChange < 0).length;
                favoritesCategory.description = `${this.favoriteItems.length} favorites • ↗${gainers} ↘${losers}`;
                favoritesCategory.tooltip = `My Favorites\n${this.favoriteItems.length} favorite coins\n${gainers} gainers, ${losers} losers`;
            } else {
                favoritesCategory.description = `0 favorites • Click to add`;
                favoritesCategory.tooltip = `My Favorites\nNo favorites yet\nUse "Add Favorite" command to add coins`;
            }

            categories.push(favoritesCategory);

            if (this.spotItems.length > 0) {
                const spotCategory = new CryptoPriceItem(
                    'Spot Markets',
                    '',
                    0,
                    'spot',
                    vscode.TreeItemCollapsibleState.Expanded
                );
                spotCategory.contextValue = 'category';
                spotCategory.command = undefined;
                spotCategory.iconPath = new vscode.ThemeIcon('graph');

                // Add summary information to category description
                const gainers = this.spotItems.filter(item => item.priceChange > 0).length;
                const losers = this.spotItems.filter(item => item.priceChange < 0).length;
                spotCategory.description = `${this.spotItems.length} pairs • ↗${gainers} ↘${losers}`;
                spotCategory.tooltip = `Spot Markets\n${this.spotItems.length} trading pairs\n${gainers} gainers, ${losers} losers`;

                categories.push(spotCategory);
            }

            if (this.futuresItems.length > 0) {
                const futuresCategory = new CryptoPriceItem(
                    'Futures Markets',
                    '',
                    0,
                    'futures',
                    vscode.TreeItemCollapsibleState.Expanded
                );
                futuresCategory.contextValue = 'category';
                futuresCategory.command = undefined;
                futuresCategory.iconPath = new vscode.ThemeIcon('graph-line');

                // Add summary information to category description
                const gainers = this.futuresItems.filter(item => item.priceChange > 0).length;
                const losers = this.futuresItems.filter(item => item.priceChange < 0).length;
                futuresCategory.description = `${this.futuresItems.length} pairs • ↗${gainers} ↘${losers}`;
                futuresCategory.tooltip = `Futures Markets\n${this.futuresItems.length} trading pairs\n${gainers} gainers, ${losers} losers`;

                categories.push(futuresCategory);
            }

            return Promise.resolve(categories);
        } else {
            // Return children for categories
            if (element.symbol === 'My Favorites') {
                if (this.favoriteItems.length === 0) {
                    // Show placeholder when no favorites
                    const placeholder = new CryptoPriceItem(
                        'No favorites yet',
                        'Use "Add Favorite" command',
                        0,
                        'spot',
                        vscode.TreeItemCollapsibleState.None
                    );
                    placeholder.contextValue = 'placeholder';
                    placeholder.iconPath = new vscode.ThemeIcon('info');
                    placeholder.command = {
                        command: 'cryptop.addFavorite',
                        title: 'Add Favorite'
                    };
                    return Promise.resolve([placeholder]);
                }
                return Promise.resolve(this.favoriteItems);
            } else if (element.symbol === 'Spot Markets') {
                return Promise.resolve(this.spotItems);
            } else if (element.symbol === 'Futures Markets') {
                return Promise.resolve(this.futuresItems);
            }
        }

        return Promise.resolve([]);
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
