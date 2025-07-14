import * as vscode from 'vscode';

export interface FavoriteCategory {
    id: string;
    name: string;
    symbols: string[];
    createdAt: Date;
}

export class FavoritesManager {
    private favorites: Set<string> = new Set();
    private categories: Map<string, FavoriteCategory> = new Map();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadFavorites();
        this.loadCategories();
    }

    public async addFavorite(symbol: string): Promise<void> {
        if (this.favorites.has(symbol)) {
            return;
        }

        this.favorites.add(symbol);
        await this.saveFavorites();
        console.log(`已添加收藏: ${symbol}`);
    }

    public async removeFavorite(symbol: string): Promise<void> {
        if (!this.favorites.has(symbol)) {
            return;
        }

        this.favorites.delete(symbol);

        // 同时从所有分类中移除
        for (const category of this.categories.values()) {
            const index = category.symbols.indexOf(symbol);
            if (index !== -1) {
                category.symbols.splice(index, 1);
            }
        }

        await this.saveFavorites();
        await this.saveCategories();
        console.log(`已移除收藏: ${symbol}`);
    }

    public getFavorites(): string[] {
        return Array.from(this.favorites);
    }

    public isFavorite(symbol: string): boolean {
        return this.favorites.has(symbol);
    }

    public async createCategory(name: string): Promise<string> {
        const id = this.generateCategoryId();
        const category: FavoriteCategory = {
            id,
            name,
            symbols: [],
            createdAt: new Date()
        };

        this.categories.set(id, category);
        await this.saveCategories();
        console.log(`已创建分类: ${name}`);
        return id;
    }

    public async removeCategory(categoryId: string): Promise<void> {
        if (!this.categories.has(categoryId)) {
            return;
        }

        this.categories.delete(categoryId);
        await this.saveCategories();
        console.log(`已删除分类: ${categoryId}`);
    }

    public async renameCategory(categoryId: string, newName: string): Promise<void> {
        const category = this.categories.get(categoryId);
        if (!category) {
            return;
        }

        category.name = newName;
        await this.saveCategories();
        console.log(`已重命名分类: ${categoryId} -> ${newName}`);
    }

    public async addToCategory(categoryId: string, symbol: string): Promise<void> {
        const category = this.categories.get(categoryId);
        if (!category) {
            return;
        }

        // 确保是收藏的币种
        if (!this.favorites.has(symbol)) {
            await this.addFavorite(symbol);
        }

        if (!category.symbols.includes(symbol)) {
            category.symbols.push(symbol);
            await this.saveCategories();
            console.log(`已将 ${symbol} 添加到分类 ${category.name}`);
        }
    }

    public async removeFromCategory(categoryId: string, symbol: string): Promise<void> {
        const category = this.categories.get(categoryId);
        if (!category) {
            return;
        }

        const index = category.symbols.indexOf(symbol);
        if (index !== -1) {
            category.symbols.splice(index, 1);
            await this.saveCategories();
            console.log(`已从分类 ${category.name} 中移除 ${symbol}`);
        }
    }

    public getCategories(): FavoriteCategory[] {
        return Array.from(this.categories.values());
    }

    public getCategory(categoryId: string): FavoriteCategory | undefined {
        return this.categories.get(categoryId);
    }

    public getCategoryByName(name: string): FavoriteCategory | undefined {
        for (const category of this.categories.values()) {
            if (category.name === name) {
                return category;
            }
        }
        return undefined;
    }

    public getSymbolsByCategory(categoryId: string): string[] {
        const category = this.categories.get(categoryId);
        return category ? category.symbols : [];
    }

    public getUncategorizedSymbols(): string[] {
        const categorizedSymbols = new Set<string>();
        for (const category of this.categories.values()) {
            category.symbols.forEach(symbol => categorizedSymbols.add(symbol));
        }

        return Array.from(this.favorites).filter(symbol => !categorizedSymbols.has(symbol));
    }

    private generateCategoryId(): string {
        return 'cat_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    private async saveFavorites(): Promise<void> {
        const favoritesArray = Array.from(this.favorites);
        await this.context.globalState.update('cryptop.favorites', favoritesArray);
    }

    private loadFavorites(): void {
        const favoritesArray = this.context.globalState.get<string[]>('cryptop.favorites', []);
        this.favorites = new Set(favoritesArray);
        console.log(`已加载 ${this.favorites.size} 个收藏币种`);
    }

    private async saveCategories(): Promise<void> {
        const categoriesData: Record<string, FavoriteCategory> = {};
        this.categories.forEach((category, id) => {
            categoriesData[id] = category;
        });

        await this.context.globalState.update('cryptop.categories', categoriesData);
    }

    private loadCategories(): void {
        const categoriesData = this.context.globalState.get<Record<string, FavoriteCategory>>('cryptop.categories', {});

        Object.entries(categoriesData).forEach(([id, category]) => {
            // 恢复Date对象
            const restoredCategory: FavoriteCategory = {
                id: category.id,
                name: category.name,
                symbols: category.symbols,
                createdAt: new Date(category.createdAt)
            };
            this.categories.set(id, restoredCategory);
        });

        console.log(`已加载 ${this.categories.size} 个收藏分类`);
    }

    public async clearAllFavorites(): Promise<void> {
        this.favorites.clear();
        this.categories.clear();
        await this.saveFavorites();
        await this.saveCategories();
        console.log('所有收藏已清除');
    }

    public async exportFavorites(): Promise<string> {
        const exportData = {
            favorites: Array.from(this.favorites),
            categories: Array.from(this.categories.values()),
            exportDate: new Date().toISOString()
        };

        return JSON.stringify(exportData, null, 2);
    }

    public async importFavorites(importData: string): Promise<void> {
        try {
            const data = JSON.parse(importData);

            if (data.favorites && Array.isArray(data.favorites)) {
                this.favorites = new Set(data.favorites);
                await this.saveFavorites();
            }

            if (data.categories && Array.isArray(data.categories)) {
                this.categories.clear();
                data.categories.forEach((category: any) => {
                    const restoredCategory: FavoriteCategory = {
                        ...category,
                        createdAt: new Date(category.createdAt)
                    };
                    this.categories.set(category.id, restoredCategory);
                });
                await this.saveCategories();
            }

            console.log('收藏数据导入成功');
        } catch (error) {
            console.error('收藏数据导入失败:', error);
            throw new Error('导入数据格式错误');
        }
    }
} 