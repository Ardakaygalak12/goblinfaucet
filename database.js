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

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                return data.record || {};
            } catch (error) {
                console.error('Data fetch error:', error);
                return {
                    users: {},
                    shortlinks: [],
                    ptcAds: [],
                    tasks: [],
                    globalStats: {
                        totalUsers: 0,
                        totalBonk: 0
                    }
                };
            }
        },

        async updateData(data) {
            try {
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}`, {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

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
                
                // Ensure users object exists
                if (!data.users) {
                    data.users = {};
                }

                // Create user if not exists
                if (!data.users[userId]) {
                    data.users[userId] = {};
                }

                // Merge existing user data with new data
                data.users[userId] = {
                    ...data.users[userId],
                    ...userData,
                    lastUpdated: new Date().toISOString()
                };

                // Update global stats if needed
                if (!data.globalStats) {
                    data.globalStats = { 
                        totalUsers: Object.keys(data.users).length,
                        totalBonk: 0
                    };
                } else {
                    data.globalStats.totalUsers = Object.keys(data.users).length;
                }

                return await DATABASE.api.updateData(data);
            } catch (error) {
                console.error('User update error:', error);
                return null;
            }
        },

        async getUser(userId) {
            try {
                const data = await DATABASE.api.getAllData();
                
                // Create user if not exists
                if (!data.users || !data.users[userId]) {
                    // Initialize default user data
                    const defaultUserData = {
                        userId: userId,
                        joinDate: new Date().toISOString(),
                        bonkBalance: 0,
                        earnings: {},
                        gameStats: {
                            flappyBird: { highScore: 0, totalPlays: 0 },
                            clicker: { totalClicks: 0, autoClickers: 0 },
                            dinoRunner: { highScore: 0, totalPlays: 0 }
                        },
                        referrals: [],
                        adWatchCount: 0,
                        shortlinkCount: 0
                    };

                    // Update data with new user
                    if (!data.users) {
                        data.users = {};
                    }
                    data.users[userId] = defaultUserData;
                    await DATABASE.api.updateData(data);

                    return defaultUserData;
                }

                return data.users[userId];
            } catch (error) {
                console.error('User fetch error:', error);
                return null;
            }
        },

        async addReferral(userId, referrerId) {
            try {
                const data = await DATABASE.api.getAllData();
                
                // Ensure users object exists
                if (!data.users) {
                    data.users = {};
                }

                // Create users if they don't exist
                if (!data.users[userId]) {
                    data.users[userId] = {
                        referredBy: referrerId,
                        joinDate: new Date().toISOString(),
                        bonkBalance: 0,
                        referrals: []
                    };
                }

                if (!data.users[referrerId]) {
                    data.users[referrerId] = {
                        bonkBalance: 0,
                        referrals: []
                    };
                }

                // Add referral bonus to referrer
                const referralBonus = 1000;
                data.users[referrerId].bonkBalance = 
                    (data.users[referrerId].bonkBalance || 0) + referralBonus;

                // Track referral
                if (!data.users[referrerId].referrals) {
                    data.users[referrerId].referrals = [];
                }
                data.users[referrerId].referrals.push({
                    userId: userId,
                    date: new Date().toISOString(),
                    bonus: referralBonus
                });

                return await DATABASE.api.updateData(data);
            } catch (error) {
                console.error('Referral error:', error);
                return null;
            }
        }
    },

    // Earning Management  
    earnings: {
        async recordEarning(userId, source, amount) {
            try {
                const data = await DATABASE.api.getAllData();
                
                // Ensure users object exists
                if (!data.users) {
                    data.users = {};
                }

                // Create user if not exists
                if (!data.users[userId]) {
                    data.users[userId] = { 
                        earnings: {},
                        bonkBalance: 0
                    };
                }

                // Initialize earnings if not exists
                if (!data.users[userId].earnings) {
                    data.users[userId].earnings = {};
                }

                // Record earning
                data.users[userId].earnings[source] = 
                    (data.users[userId].earnings[source] || 0) + amount;

                // Update BONK balance
                data.users[userId].bonkBalance = 
                    (data.users[userId].bonkBalance || 0) + amount;

                // Update global stats
                if (!data.globalStats) {
                    data.globalStats = { 
                        totalBonk: 0,
                        totalEarnings: {}
                    };
                }
                data.globalStats.totalBonk = 
                    (data.globalStats.totalBonk || 0) + amount;
                data.globalStats.totalEarnings[source] = 
                    (data.globalStats.totalEarnings[source] || 0) + amount;

                return await DATABASE.api.updateData(data);
            } catch (error) {  
                console.error('Earning record error:', error);
                return null;
            }
        }
    },

    // Ad Management 
    ads: {
        async recordAdWatch(userId) {
            try {
                const adReward = 100; // BONK per ad view
                
                // Use earnings method to record ad watch
                const result = await DATABASE.earnings.recordEarning(
                    userId, 
                    'ptcAds', 
                    adReward
                );

                // Update user's ad watch count
                const userData = await DATABASE.users.getUser(userId);
                userData.adWatchCount = (userData.adWatchCount || 0) + 1;
                await DATABASE.users.updateUser(userId, userData);

                return adReward;
            } catch (error) {
                console.error('Ad watch record error:', error);
                throw new Error(`Failed to record ad watch: ${error.message}`);
            }
        }
    },

    // Link Management
    links: {  
        async recordLinkClick(userId) {
            try {
                const shortlinkReward = 50; // BONK per shortlink
                
                // Use earnings method to record shortlink click
                const result = await DATABASE.earnings.recordEarning(
                    userId, 
                    'shortLinks', 
                    shortlinkReward
                );

                // Update user's shortlink count
                const userData = await DATABASE.users.getUser(userId);
                userData.shortlinkCount = (userData.shortlinkCount || 0) + 1;
                await DATABASE.users.updateUser(userId, userData);

                return shortlinkReward;
            } catch (error) {
                console.error('Link click record error:', error);
                throw new Error(`Failed to record shortlink click: ${error.message}`);
            }
        }
    },

    // Game Management
    games: {
        async updateGameStats(userId, gameType, stats) {
            try {
                const data = await DATABASE.api.getAllData();
                
                // Ensure user exists
                if (!data.users[userId]) {
                    data.users[userId] = { gameStats: {} };
                }
                if (!data.users[userId].gameStats) {
                    data.users[userId].gameStats = {};
                }

                const now = new Date().toISOString();

                // Game-specific stat updates
                switch (gameType) {
                    case 'flappyBird':
                        data.users[userId].gameStats.flappyBird = {
                            highScore: Math.max(
                                data.users[userId].gameStats.flappyBird?.highScore || 0, 
                                stats.score
                            ),
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
                            highScore: Math.max(
                                data.users[userId].gameStats.dinoRunner?.highScore || 0, 
                                stats.score
                            ),
                            totalPlays: (data.users[userId].gameStats.dinoRunner?.totalPlays || 0) + 1,
                            lastScore: stats.score,
                            lastPlayed: now
                        };
                        break;
                }

                // Update BONK balance from game earnings
                if (stats.bonkEarned) {
                    data.users[userId].bonkBalance = 
                        (data.users[userId].bonkBalance || 0) + stats.bonkEarned;
                }

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
// Database Statistics and Advanced Features
DATABASE.analytics = {
    async trackUserActivity(userId, activityType) {
        try {
            const data = await DATABASE.api.getAllData();
            
            // Ensure activity tracking exists
            if (!data.userActivities) {
                data.userActivities = {};
            }

            // Track specific user activity
            if (!data.userActivities[userId]) {
                data.userActivities[userId] = {};
            }

            // Log activity timestamp
            data.userActivities[userId][activityType] = {
                timestamp: new Date().toISOString(),
                count: (data.userActivities[userId][activityType]?.count || 0) + 1
            };

            return await DATABASE.api.updateData(data);
        } catch (error) {
            console.error('User activity tracking error:', error);
            return null;
        }
    },

    async generateActivityReport() {
        try {
            const data = await DATABASE.api.getAllData();
            const users = Object.keys(data.users || {});

            // Comprehensive activity analysis
            const activityReport = {
                totalUsers: users.length,
                activeUsers: 0,
                inactiveUsers: 0,
                activityBreakdown: {
                    adViews: 0,
                    shortlinkClicks: 0,
                    gamePlays: 0,
                    taskCompletions: 0
                }
            };

            // Analyze user activities
            users.forEach(userId => {
                const userData = data.users[userId];
                const userActivities = data.userActivities?.[userId] || {};

                // Check user activity
                const isActive = Object.values(userActivities).some(
                    activity => {
                        const activityDate = new Date(activity.timestamp);
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        return activityDate > thirtyDaysAgo;
                    }
                );

                if (isActive) {
                    activityReport.activeUsers++;
                } else {
                    activityReport.inactiveUsers++;
                }

                // Aggregate activity types
                activityReport.activityBreakdown.adViews += 
                    userData.earnings?.ptcAds || 0;
                activityReport.activityBreakdown.shortlinkClicks += 
                    userData.earnings?.shortLinks || 0;
                activityReport.activityBreakdown.gamePlays += 
                    (userData.gameStats?.flappyBird?.totalPlays || 0) +
                    (userData.gameStats?.dinoRunner?.totalPlays || 0);
                activityReport.activityBreakdown.taskCompletions += 
                    userData.completedTasks?.length || 0;
            });

            return activityReport;
        } catch (error) {
            console.error('Activity report generation error:', error);
            return null;
        }
    }
};

// Advanced Security Features
DATABASE.security = {
    async validateUser(userId, additionalCheck = null) {
        try {
            const userData = await DATABASE.users.getUser(userId);
            
            // Basic validation checks
            if (!userData) {
                throw new Error('User not found');
            }

            // Additional custom validation if provided
            if (additionalCheck && typeof additionalCheck === 'function') {
                const customValidation = await additionalCheck(userData);
                if (!customValidation) {
                    throw new Error('Custom validation failed');
                }
            }

            return true;
        } catch (error) {
            console.error('User validation error:', error);
            return false;
        }
    },

    async logSecurityEvent(userId, eventType, details = {}) {
        try {
            const data = await DATABASE.api.getAllData();
            
            // Ensure security logs exist
            if (!data.securityLogs) {
                data.securityLogs = {};
            }

            // Create log entry
            if (!data.securityLogs[userId]) {
                data.securityLogs[userId] = [];
            }

            data.securityLogs[userId].push({
                eventType,
                timestamp: new Date().toISOString(),
                details
            });

            return await DATABASE.api.updateData(data);
        } catch (error) {
            console.error('Security event logging error:', error);
            return null;
        }
    }
};

// Error Tracking and Monitoring
DATABASE.errorTracking = {
    async recordError(errorDetails) {
        try {
            const data = await DATABASE.api.getAllData();
            
            // Ensure error logs exist
            if (!data.errorLogs) {
                data.errorLogs = [];
            }

            // Add error to logs
            data.errorLogs.push({
                timestamp: new Date().toISOString(),
                ...errorDetails
            });

            // Limit error logs to prevent excessive growth
            if (data.errorLogs.length > 1000) {
                data.errorLogs = data.errorLogs.slice(-1000);
            }

            return await DATABASE.api.updateData(data);
        } catch (error) {
            console.error('Error logging failed:', error);
            return null;
        }
    },

    async getRecentErrors(limit = 50) {
        try {
            const data = await DATABASE.api.getAllData();
            
            return (data.errorLogs || [])
                .slice(-limit)
                .reverse(); // Most recent first
        } catch (error) {
            console.error('Retrieving error logs failed:', error);
            return [];
        }
    }
};

// Export the entire DATABASE object if needed in module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DATABASE;
}
