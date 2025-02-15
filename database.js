// Database Management System
const DATABASE = {
    config: {
        binId: '67b0a195ad19ca34f804ba90',
        apiKey: '$2a$10$m3ykh1NKxmtQDVM140H6TOTqsemkiBEdfdQnG/ApyhjJ1Duj2Ri6W'
    },

    // JSONbin.io API Operations
    api: {
        baseUrl: 'https://api.jsonbin.io/v3/b',
        
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': '$2a$10$m3ykh1NKxmtQDVM140H6TOTqsemkiBEdfdQnG/ApyhjJ1Duj2Ri6W',
            'X-Bin-Meta': false
        },

        async getAllData() {
            try {
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}/latest`, {
                    headers: this.headers
                });
                return await response.json();
            } catch (error) {
                console.error('Data fetch error:', error);
                return null;
            }
        },

        async updateData(data) {
            try {
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}`, {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify(data)
                });
                return await response.json();
            } catch (error) {
                console.error('Data update error:', error);
                return null;
            }
        }
    },

    // User Management
    users: {
        async updateUser(userId, userData) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.users) data.users = {};

                // Preserve existing user data structure
                data.users[userId] = {
                    ...data.users[userId],
                    ...userData,
                    lastUpdated: new Date().toISOString()
                };

                return await DATABASE.api.updateData(data);
            } catch (error) {
                console.error('User update error:', error);
                return null;
            }
        },

        async getUser(userId) {
            try {
                const data = await DATABASE.api.getAllData();
                return data.users?.[userId] || null;
            } catch (error) {
                console.error('User fetch error:', error);
                return null;
            }
        },

        async addReferral(userId, referrerId) {
            try {
                const data = await DATABASE.api.getAllData();
                
                // Initialize new user with referral data
                if (!data.users[userId]) {
                    data.users[userId] = {
                        referredBy: referrerId,
                        joinDate: new Date().toISOString(),
                        bonkBalance: 0,
                        gameStats: {
                            flappyBird: { highScore: 0, totalPlays: 0 },
                            clicker: { totalClicks: 0, autoClickers: 0 },
                            dinoRunner: { highScore: 0, totalPlays: 0 }
                        }
                    };
                }

                // Award referral bonus
                if (data.users[referrerId]) {
                    data.users[referrerId].bonkBalance = (data.users[referrerId].bonkBalance || 0) + 1000;
                    if (!data.users[referrerId].referrals) data.users[referrerId].referrals = [];
                    data.users[referrerId].referrals.push({
                        userId: userId,
                        date: new Date().toISOString()
                    });
                }

                return await DATABASE.api.updateData(data);
            } catch (error) {
                console.error('Referral error:', error);
                return null;
            }
        }
    },

    // Game Management
    games: {
        async updateGameStats(userId, gameType, stats) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.users[userId]) {
                    data.users[userId] = { gameStats: {} };
                }
                if (!data.users[userId].gameStats) {
                    data.users[userId].gameStats = {};
                }

                const now = new Date().toISOString();

                switch (gameType) {
                    case 'flappyBird':
                        data.users[userId].gameStats.flappyBird = {
                            highScore: Math.max(data.users[userId].gameStats.flappyBird?.highScore || 0, stats.score),
                            totalPlays: (data.users[userId].gameStats.flappyBird?.totalPlays || 0) + 1,
                            lastScore: stats.score,
                            lastPlayed: now
                        };
                        break;

                    case 'clicker':
                        data.users[userId].gameStats.clicker = {
                            totalClicks: (data.users[userId].gameStats.clicker?.totalClicks || 0) + stats.clicks,
                            autoClickers: stats.autoClickers,
                            lastUpdated: now
                        };
                        break;

                    case 'dinoRunner':
                        data.users[userId].gameStats.dinoRunner = {
                            highScore: Math.max(data.users[userId].gameStats.dinoRunner?.highScore || 0, stats.score),
                            totalPlays: (data.users[userId].gameStats.dinoRunner?.totalPlays || 0) + 1,
                            lastScore: stats.score,
                            lastPlayed: now
                        };
                        break;
                }

                // Update BONK balance
                data.users[userId].bonkBalance = (data.users[userId].bonkBalance || 0) + (stats.bonkEarned || 0);

                return await DATABASE.api.updateData(data);
            } catch (error) {
                console.error('Game stats update error:', error);
                return null;
            }
        }
    },

    // Statistics
    stats: {
        async getGlobalStats() {
            try {
                const data = await DATABASE.api.getAllData();
                const users = Object.values(data.users || {});

                return {
                    totalUsers: users.length,
                    totalBonk: users.reduce((sum, user) => sum + (user.bonkBalance || 0), 0),
                    gameStats: {
                        flappyBird: {
                            highScore: Math.max(...users.map(u => u.gameStats?.flappyBird?.highScore || 0)),
                            totalPlays: users.reduce((sum, u) => sum + (u.gameStats?.flappyBird?.totalPlays || 0), 0)
                        },
                        clicker: {
                            totalClicks: users.reduce((sum, u) => sum + (u.gameStats?.clicker?.totalClicks || 0), 0),
                            activeAutoClickers: users.reduce((sum, u) => sum + (u.gameStats?.clicker?.autoClickers || 0), 0)
                        },
                        dinoRunner: {
                            highScore: Math.max(...users.map(u => u.gameStats?.dinoRunner?.highScore || 0)),
                            totalPlays: users.reduce((sum, u) => sum + (u.gameStats?.dinoRunner?.totalPlays || 0), 0)
                        }
                    },
                    referralStats: {
                        totalReferrals: users.reduce((sum, u) => sum + (u.referrals?.length || 0), 0),
                        topReferrers: users
                            .map(u => ({ 
                                userId: u.userId, 
                                referralCount: u.referrals?.length || 0 
                            }))
                            .sort((a, b) => b.referralCount - a.referralCount)
                            .slice(0, 10)
                    }
                };
            } catch (error) {
                console.error('Stats fetch error:', error);
                return null;
            }
        },

        async getLeaderboard(gameType, limit = 10) {
            try {
                const data = await DATABASE.api.getAllData();
                const users = Object.entries(data.users || {});

                const leaderboardMap = {
                    flappyBird: users => users.map(([id, user]) => ({
                        userId: id,
                        score: user.gameStats?.flappyBird?.highScore || 0
                    })),
                    clicker: users => users.map(([id, user]) => ({
                        userId: id,
                        clicks: user.gameStats?.clicker?.totalClicks || 0
                    })),
                    dinoRunner: users => users.map(([id, user]) => ({
                        userId: id,
                        score: user.gameStats?.dinoRunner?.highScore || 0
                    })),
                    bonkBalance: users => users.map(([id, user]) => ({
                        userId: id,
                        balance: user.bonkBalance || 0
                    }))
                };

                const mapper = leaderboardMap[gameType];
                if (!mapper) return null;

                const sortedUsers = mapper(users).sort((a, b) => {
                    const scoreA = a.score || a.clicks || a.balance || 0;
                    const scoreB = b.score || b.clicks || b.balance || 0;
                    return scoreB - scoreA;
                });

                return sortedUsers.slice(0, limit);
            } catch (error) {
                console.error('Leaderboard fetch error:', error);
                return null;
            }
        }
    }
};

// Usage examples:
/*
// Update user
await DATABASE.users.updateUser('telegramId', {
    username: 'userName',
    bonkBalance: 1000
});

// Add referral
await DATABASE.users.addReferral('newUserId', 'referrerId');

// Update game stats
await DATABASE.games.updateGameStats('telegramId', 'flappyBird', {
    score: 10,
    bonkEarned: 500
});

// Get statistics
const stats = await DATABASE.stats.getGlobalStats();

// Get leaderboard
const leaderboard = await DATABASE.stats.getLeaderboard('flappyBird', 5);
*/
