const DATABASE_CONFIG = {
    BIN_ID: "67b0a195ad19ca34f804ba90",
    API_KEY: "$2a$10$m3ykh1NKxmtQDVM140H6TOTqsemkiBEdfdQnG/ApyhjJ1Duj2Ri6W",
    BASE_URL: "https://api.jsonbin.io/v3/b"
};

class Database {
    constructor() {
        this.binId = DATABASE_CONFIG.BIN_ID;
        this.apiKey = DATABASE_CONFIG.API_KEY;
        this.cache = null;
        this.lastUpdate = null;
    }

    async init() {
        if (!this.cache) {
            await this.fetchData();
        }
    }

    async fetchData() {
        try {
            const response = await fetch(`${DATABASE_CONFIG.BASE_URL}/${this.binId}/latest`, {
                headers: {
                    'X-Master-Key': this.apiKey
                }
            });
            
            if (!response.ok) {
                throw new Error('Database fetch failed');
            }

            const data = await response.json();
            this.cache = data.record;
            this.lastUpdate = new Date();
            return this.cache;
        } catch (error) {
            console.error('Database fetch error:', error);
            throw error;
        }
    }

    async updateData(newData) {
        try {
            const response = await fetch(`${DATABASE_CONFIG.BASE_URL}/${this.binId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': this.apiKey
                },
                body: JSON.stringify(newData)
            });

            if (!response.ok) {
                throw new Error('Database update failed');
            }

            const data = await response.json();
            this.cache = data.record;
            this.lastUpdate = new Date();
            return this.cache;
        } catch (error) {
            console.error('Database update error:', error);
            throw error;
        }
    }

    // Wallet Operations
    async updateWalletConnection(userId, isConnected, walletAddress = null) {
        await this.init();
        const updates = {
            isWalletConnected: isConnected
        };
        if (walletAddress) {
            updates.phantomWallet = walletAddress;
        }
        return this.updateUser(userId, updates);
    }

    // User Operations
    async createUser(userData) {
        await this.init();
        const users = this.cache.users || [];
        const newUser = {
            ...userData,
            id: crypto.randomUUID(),
            balance: { bonk: 0, usdt: 0 },
            isWalletConnected: false,
            dailyLimits: {
                shortlinks: {
                    count: 0,
                    lastReset: new Date().toISOString(),
                    maxDaily: this.cache.settings.shortlinkLimits.userDailyMax
                },
                ptcAds: {
                    count: 0,
                    lastReset: new Date().toISOString(),
                    maxDaily: 20
                }
            },
            totalEarned: { bonk: 0, usdt: 0 },
            withdrawals: [],
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        this.cache.users = users;
        
        // Update statistics
        this.cache.statistics.totalUsers++;
        this.cache.statistics.dailyStats.newUsers++;
        
        return this.updateData(this.cache);
    }

    async getUser(userId) {
        await this.init();
        return this.cache.users.find(user => user.id === userId);
    }

    async updateUser(userId, updates) {
        await this.init();
        const userIndex = this.cache.users.findIndex(user => user.id === userId);
        if (userIndex !== -1) {
            this.cache.users[userIndex] = {
                ...this.cache.users[userIndex],
                ...updates
            };
            return this.updateData(this.cache);
        }
        throw new Error('User not found');
    }

    // Shortlink Operations
    async createShortlink(shortlinkData) {
        await this.init();
        const shortlinks = this.cache.shortlinks || [];
        const newShortlink = {
            ...shortlinkData,
            id: crypto.randomUUID(),
            views: 0,
            dailyLimit: shortlinkData.dailyLimit || 100,
            remainingDailyViews: shortlinkData.dailyLimit || 100,
            lastReset: new Date().toISOString(),
            active: true,
            createdAt: new Date().toISOString()
        };
        shortlinks.push(newShortlink);
        this.cache.shortlinks = shortlinks;
        return this.updateData(this.cache);
    }

    async getActiveShortlinks() {
        await this.init();
        return this.cache.shortlinks.filter(link => link.active && link.remainingDailyViews > 0);
    }

    async resetDailyShortlinkLimits() {
        await this.init();
        // Reset shortlink daily views
        this.cache.shortlinks = this.cache.shortlinks.map(link => ({
            ...link,
            remainingDailyViews: link.dailyLimit,
            lastReset: new Date().toISOString()
        }));

        // Reset user daily limits
        this.cache.users = this.cache.users.map(user => ({
            ...user,
            dailyLimits: {
                ...user.dailyLimits,
                shortlinks: {
                    ...user.dailyLimits.shortlinks,
                    count: 0,
                    lastReset: new Date().toISOString()
                }
            }
        }));

        return this.updateData(this.cache);
    }

    async processShortlinkClaim(userId, shortlinkId) {
        await this.init();
        const user = await this.getUser(userId);
        const shortlink = this.cache.shortlinks.find(link => link.id === shortlinkId);
        
        if (!user || !shortlink) {
            throw new Error('User or shortlink not found');
        }

        // Check user daily limit
        const today = new Date().toDateString();
        const lastResetDate = new Date(user.dailyLimits.shortlinks.lastReset).toDateString();
        
        if (today !== lastResetDate) {
            user.dailyLimits.shortlinks.count = 0;
            user.dailyLimits.shortlinks.lastReset = new Date().toISOString();
        }

        if (user.dailyLimits.shortlinks.count >= user.dailyLimits.shortlinks.maxDaily) {
            throw new Error('Daily shortlink limit reached');
        }

        // Check shortlink daily limit
        if (shortlink.remainingDailyViews <= 0) {
            throw new Error('Shortlink daily limit reached');
        }

        // Process claim
        shortlink.views++;
        shortlink.remainingDailyViews--;
        user.dailyLimits.shortlinks.count++;
        user.balance.bonk += shortlink.reward;
        user.totalEarned.bonk += shortlink.reward;

        // Update statistics
        this.cache.statistics.dailyStats.shortlinkClaims++;

        return this.updateData(this.cache);
    }

    // PTC Ads Operations
    async createPtcAd(adData) {
        await this.init();
        const ptcAds = this.cache.ptcAds || [];
        const newAd = {
            ...adData,
            id: crypto.randomUUID(),
            remainingViews: adData.dailyLimit,
            active: true,
            createdAt: new Date().toISOString()
        };
        ptcAds.push(newAd);
        this.cache.ptcAds = ptcAds;
        return this.updateData(this.cache);
    }

    async getActivePtcAds() {
        await this.init();
        return this.cache.ptcAds.filter(ad => ad.active && ad.remainingViews > 0);
    }

    async processPtcView(userId, adId) {
        await this.init();
        const user = await this.getUser(userId);
        const ad = this.cache.ptcAds.find(a => a.id === adId);

        if (!user || !ad) {
            throw new Error('User or ad not found');
        }

        // Check user daily limit
        const today = new Date().toDateString();
        const lastResetDate = new Date(user.dailyLimits.ptcAds.lastReset).toDateString();

        if (today !== lastResetDate) {
            user.dailyLimits.ptcAds.count = 0;
            user.dailyLimits.ptcAds.lastReset = new Date().toISOString();
        }

        if (user.dailyLimits.ptcAds.count >= user.dailyLimits.ptcAds.maxDaily) {
            throw new Error('Daily PTC limit reached');
        }

        // Process view
        ad.remainingViews--;
        user.dailyLimits.ptcAds.count++;
        user.balance.bonk += ad.reward;
        user.totalEarned.bonk += ad.reward;

        // Update statistics
        this.cache.statistics.dailyStats.ptcViews++;

        if (ad.remainingViews <= 0) {
            ad.active = false;
        }

        return this.updateData(this.cache);
    }

    // Balance Operations
    async updateBalance(userId, currency, amount) {
        await this.init();
        const user = await this.getUser(userId);
        if (user) {
            user.balance[currency] += amount;
            if (amount > 0) {
                user.totalEarned[currency] += amount;
            }
            return this.updateUser(userId, { balance: user.balance, totalEarned: user.totalEarned });
        }
        throw new Error('User not found');
    }

    // Withdrawal Operations
    async createWithdrawal(userId, amount, currency) {
        await this.init();
        const user = await this.getUser(userId);
        if (!user) {
            throw new Error('User not found');
        }

        if (!user.isWalletConnected) {
            throw new Error('Wallet not connected');
        }

        if (user.balance[currency] < amount) {
            throw new Error('Insufficient balance');
        }

        const withdrawal = {
            id: crypto.randomUUID(),
            amount,
            currency,
            status: 'pending',
            timestamp: new Date().toISOString(),
            txHash: null
        };

        user.withdrawals.push(withdrawal);
        user.balance[currency] -= amount;

        return this.updateData(this.cache);
    }

    // Statistics Operations
    async updateStatistics(updates) {
        await this.init();
        this.cache.statistics = {
            ...this.cache.statistics,
            ...updates,
            dailyStats: {
                ...this.cache.statistics.dailyStats,
                ...updates.dailyStats
            }
        };
        return this.updateData(this.cache);
    }

    async resetDailyStats() {
        await this.init();
        this.cache.statistics.dailyStats = {
            date: new Date().toISOString(),
            shortlinkClaims: 0,
            ptcViews: 0,
            newUsers: 0
        };
        return this.updateData(this.cache);
    }

    // Settings Operations
    async getSettings() {
        await this.init();
        return this.cache.settings;
    }

    async updateSettings(newSettings) {
        await this.init();
        this.cache.settings = {
            ...this.cache.settings,
            ...newSettings
        };
        return this.updateData(this.cache);
    }
}

// Export singleton instance
const db = new Database();
export default db;
