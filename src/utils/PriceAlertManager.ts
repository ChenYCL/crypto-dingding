import * as vscode from 'vscode';

export interface PriceAlert {
    symbol: string;
    targetPrice: number;
    createdAt: Date;
    isActive: boolean;
}

export class PriceAlertManager {
    private alerts: Map<string, PriceAlert[]> = new Map();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadAlerts();
    }

    public async setPriceAlert(symbol: string, targetPrice: number): Promise<void> {
        const alert: PriceAlert = {
            symbol,
            targetPrice,
            createdAt: new Date(),
            isActive: true
        };

        if (!this.alerts.has(symbol)) {
            this.alerts.set(symbol, []);
        }

        const symbolAlerts = this.alerts.get(symbol)!;
        symbolAlerts.push(alert);

        await this.saveAlerts();
        console.log(`价格提醒已设置: ${symbol} -> ${targetPrice}`);
    }

    public async removePriceAlert(symbol: string, targetPrice: number): Promise<void> {
        const symbolAlerts = this.alerts.get(symbol);
        if (!symbolAlerts) return;

        const index = symbolAlerts.findIndex(alert =>
            alert.targetPrice === targetPrice && alert.isActive
        );

        if (index !== -1) {
            symbolAlerts.splice(index, 1);
            if (symbolAlerts.length === 0) {
                this.alerts.delete(symbol);
            }
            await this.saveAlerts();
            console.log(`价格提醒已移除: ${symbol} -> ${targetPrice}`);
        }
    }

    public async deactivateAlert(symbol: string, targetPrice: number): Promise<void> {
        const symbolAlerts = this.alerts.get(symbol);
        if (!symbolAlerts) return;

        const alert = symbolAlerts.find(alert =>
            alert.targetPrice === targetPrice && alert.isActive
        );

        if (alert) {
            alert.isActive = false;
            await this.saveAlerts();
            console.log(`价格提醒已停用: ${symbol} -> ${targetPrice}`);
        }
    }

    public checkPriceAlerts(symbol: string, currentPrice: number): void {
        const symbolAlerts = this.alerts.get(symbol);
        if (!symbolAlerts) return;

        const triggeredAlerts = symbolAlerts.filter(alert => {
            if (!alert.isActive) return false;

            // 检查是否触发提醒（价格穿越目标价格）
            return Math.abs(currentPrice - alert.targetPrice) / alert.targetPrice < 0.001; // 0.1%误差范围
        });

        triggeredAlerts.forEach(alert => {
            this.triggerAlert(alert, currentPrice);
        });
    }

    private async triggerAlert(alert: PriceAlert, currentPrice: number): Promise<void> {
        const message = `价格提醒: ${alert.symbol} 已达到目标价格 ${alert.targetPrice}，当前价格: ${currentPrice}`;

        // 显示通知
        const action = await vscode.window.showInformationMessage(
            message,
            '停用提醒',
            '设置新提醒'
        );

        if (action === '停用提醒') {
            await this.deactivateAlert(alert.symbol, alert.targetPrice);
        } else if (action === '设置新提醒') {
            const newPrice = await vscode.window.showInputBox({
                prompt: `设置 ${alert.symbol} 的新目标价格`,
                value: currentPrice.toString(),
                validateInput: (value: string) => {
                    const num = parseFloat(value);
                    return isNaN(num) || num <= 0 ? '请输入有效的价格' : null;
                }
            });

            if (newPrice) {
                await this.setPriceAlert(alert.symbol, parseFloat(newPrice));
            }
        }

        // 停用当前提醒
        await this.deactivateAlert(alert.symbol, alert.targetPrice);
    }

    public getAlerts(): Map<string, PriceAlert[]> {
        return new Map(this.alerts);
    }

    public getActiveAlerts(symbol?: string): PriceAlert[] {
        if (symbol) {
            const symbolAlerts = this.alerts.get(symbol);
            return symbolAlerts?.filter(alert => alert.isActive) || [];
        }

        const allAlerts: PriceAlert[] = [];
        this.alerts.forEach(symbolAlerts => {
            allAlerts.push(...symbolAlerts.filter(alert => alert.isActive));
        });

        return allAlerts;
    }

    private async saveAlerts(): Promise<void> {
        const alertsData: Record<string, PriceAlert[]> = {};
        this.alerts.forEach((alerts, symbol) => {
            alertsData[symbol] = alerts;
        });

        await this.context.globalState.update('cryptop.priceAlerts', alertsData);
    }

    private loadAlerts(): void {
        const alertsData = this.context.globalState.get<Record<string, PriceAlert[]>>('cryptop.priceAlerts', {});

        Object.entries(alertsData).forEach(([symbol, alerts]) => {
            // 恢复Date对象
            const restoredAlerts = alerts.map(alert => ({
                ...alert,
                createdAt: new Date(alert.createdAt)
            }));
            this.alerts.set(symbol, restoredAlerts);
        });

        console.log(`已加载 ${this.alerts.size} 个币种的价格提醒`);
    }

    public async clearAllAlerts(): Promise<void> {
        this.alerts.clear();
        await this.saveAlerts();
        console.log('所有价格提醒已清除');
    }

    public async clearSymbolAlerts(symbol: string): Promise<void> {
        this.alerts.delete(symbol);
        await this.saveAlerts();
        console.log(`${symbol} 的所有价格提醒已清除`);
    }
} 