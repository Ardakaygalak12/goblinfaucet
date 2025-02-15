const DATABASE = {
    config: {
        binId: '67b0a195ad19ca34f804ba90',
        apiKey: '$2a$10$m3ykh1NKxmtQDVM140H6TOTqsemkiBEdfdQnG/ApyhjJ1Duj2Ri6W',
        adminSettings: {
            ptcAdLimits: {
                minDuration: 10,
                maxDuration: 180
            },
            systemSettings: {
                minWithdrawAmount: 20 * 100, // 20 dolar minimum (cent cinsinden)
                maxDailyEarnings: 5000,
                maxDailyWithdrawals: 1, // Günde maksimum 1 çekim
                referralBonus: 1000
            }
        },
        phantom: {
            network: 'mainnet-beta',
            rpcUrl: 'https://api.mainnet-beta.solana.com',
            bonkMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK token mint adresi
            bonkDecimals: 5,
            dollarPerBonk: 0.00001234 // BONK/USD kuru (örnek değer)
        }
    },

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

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                return data.record || this.getDefaultData();
            } catch (error) {
                console.error('Data fetch error:', error);
                return this.getDefaultData();
            }
        },

        getDefaultData() {
            return {
                users: {},
                shortlinks: [],
                ptcAds: [],
                tasks: [],
                withdrawals: {},
                statistics: {
                    global: {
                        totalUsers: 0,
                        totalBonk: 0,
                        activeUsers: 0
                    },
                    daily: {}
                }
            };
        },

        async updateData(data) {
            try {
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}`, {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error('Data update error:', error);
                return null;
            }
        }
    },

    users: {
        async getUser(userId) {
            const data = await DATABASE.api.getAllData();
            return data.users[userId] || null;
        },

        async createUser(userData) {
            try {
                const data = await DATABASE.api.getAllData();
                
                const newUser = {
                    userId: userData.userId,
                    email: userData.email,
                    phantomWallet: userData.phantomWallet,
                    bonkBalance: 0,
                    joinDate: new Date().toISOString(),
                    lastActivity: new Date().toISOString(),
                    earnings: {
                        daily: {}
                    },
                    completedTasks: [],
                    viewedAds: [],
                    clickedLinks: []
                };

                data.users[userData.userId] = newUser;
                data.statistics.global.totalUsers++;
                await DATABASE.api.updateData(data);
                return newUser;
            } catch (error) {
                console.error('User creation error:', error);
                return null;
            }
        },

        async updateUserBalance(userId, amount) {
            const data = await DATABASE.api.getAllData();
            if (!data.users[userId]) return false;

            data.users[userId].bonkBalance = (data.users[userId].bonkBalance || 0) + amount;
            data.users[userId].lastActivity = new Date().toISOString();
            data.statistics.global.totalBonk += amount;

            await DATABASE.api.updateData(data);
            return true;
        },

        async updatePhantomWallet(userId, walletAddress) {
            const data = await DATABASE.api.getAllData();
            if (!data.users[userId]) return false;

            data.users[userId].phantomWallet = walletAddress;
            await DATABASE.api.updateData(data);
            return true;
        }
    },

    phantom: {
        async connectWallet() {
            try {
                if (!window.solana || !window.solana.isPhantom) {
                    throw new Error('Phantom wallet is not installed!');
                }

                const response = await window.solana.connect();
                return response.publicKey.toString();
            } catch (error) {
                console.error('Phantom connection error:', error);
                throw error;
            }
        },

        async initiateWithdrawal(userId, amountInDollars) {
            try {
                const user = await DATABASE.users.getUser(userId);
                if (!user) throw new Error('User not found');

                const today = new Date().toISOString().split('T')[0];
                const withdrawalCount = await this.getDailyWithdrawalCount(userId, today);
                if (withdrawalCount >= DATABASE.config.adminSettings.systemSettings.maxDailyWithdrawals) {
                    throw new Error('Daily withdrawal limit reached');
                }

                if (amountInDollars < (DATABASE.config.adminSettings.systemSettings.minWithdrawAmount / 100)) {
                    throw new Error(`Minimum withdrawal amount is $${DATABASE.config.adminSettings.systemSettings.minWithdrawAmount / 100}`);
                }

                const bonkAmount = Math.floor(amountInDollars / DATABASE.config.phantom.dollarPerBonk);

                if (user.bonkBalance < bonkAmount) {
                    throw new Error('Insufficient balance');
                }

                if (!user.phantomWallet) {
                    throw new Error('No Phantom wallet connected');
                }

                const connection = new window.solanaWeb3.Connection(
                    DATABASE.config.phantom.rpcUrl,
                    'confirmed'
                );

                const transaction = new window.solanaWeb3.Transaction();
                
                // BONK token transfer talimatı
                const transferInstruction = window.splToken.Token.createTransferInstruction(
                    new window.solanaWeb3.PublicKey(DATABASE.config.phantom.bonkMint),
                    window.solana.publicKey,
                    new window.solanaWeb3.PublicKey(user.phantomWallet),
                    window.solana.publicKey,
                    [],
                    bonkAmount * Math.pow(10, DATABASE.config.phantom.bonkDecimals)
                );

                transaction.add(transferInstruction);
                transaction.feePayer = window.solana.publicKey;
                transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;

                // Withdrawal kaydı oluştur
                const withdrawalId = `WD_${Date.now()}_${userId}`;
                await this.saveWithdrawalRecord(userId, {
                    withdrawalId,
                    amountUsd: amountInDollars,
                    amountBonk: bonkAmount,
                    walletAddress: user.phantomWallet,
                    status: 'pending',
                    date: today,
                    timestamp: new Date().toISOString()
                });

                return {
                    transaction,
                    withdrawalId,
                    bonkAmount
                };
            } catch (error) {
                console.error('Withdrawal initiation error:', error);
                throw error;
            }
        },

        async completeWithdrawal(userId, withdrawalId, signature) {
            try {
                const data = await DATABASE.api.getAllData();
                const withdrawal = data.withdrawals[userId]?.find(w => w.withdrawalId === withdrawalId);
                
                if (!withdrawal) throw new Error('Withdrawal not found');

                const connection = new window.solanaWeb3.Connection(
                    DATABASE.config.phantom.rpcUrl,
                    'confirmed'
                );
                const status = await connection.getSignatureStatus(signature);

                if (status?.value?.confirmationStatus === 'confirmed') {
                    withdrawal.status = 'completed';
                    withdrawal.signature = signature;
                    withdrawal.completedAt = new Date().toISOString();

                    await DATABASE.users.updateUserBalance(userId, -withdrawal.amountBonk);
                    await DATABASE.api.updateData(data);
                    return true;
                } else {
                    throw new Error('Transaction failed');
                }
            } catch (error) {
                console.error('Withdrawal completion error:', error);
                throw error;
            }
        },

        async getDailyWithdrawalCount(userId, date) {
            const data = await DATABASE.api.getAllData();
            return (data.withdrawals[userId] || [])
                .filter(w => w.date === date && w.status === 'completed')
                .length;
        },

        async saveWithdrawalRecord(userId, record) {
            const data = await DATABASE.api.getAllData();
            if (!data.withdrawals[userId]) {
                data.withdrawals[userId] = [];
            }
            data.withdrawals[userId].push(record);
            await DATABASE.api.updateData(data);
        },

        async getWithdrawalHistory(userId) {
            const data = await DATABASE.api.getAllData();
            return data.withdrawals[userId] || [];
        }
    },

    contentManagement: {
        async createPtcAd(adminId, adData) {
            try {
                const data = await DATABASE.api.getAllData();
                
                const newAd = {
                    id: Date.now().toString(),
                    title: adData.title,
                    url: adData.url,
                    bonkReward: parseInt(adData.bonkReward),
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    createdBy: adminId,
                    settings: {
                        viewDuration: parseInt(adData.viewDuration) || 15,
                        dailyLimit: parseInt(adData.dailyLimit) || 15
                    },
                    stats: {
                        totalViews: 0,
                        uniqueViews: 0,
                        bonkPaid: 0
                    }
                };

                data.ptcAds.push(newAd);
                await DATABASE.api.updateData(data);
                return newAd;
            } catch (error) {
                console.error('PTC ad creation error:', error);
                return null;
            }
        },

        async createShortlink(adminId, linkData) {
            try {
                const data = await DATABASE.api.getAllData();
                
                const newLink = {
                    id: Date.now().toString(),
                    title: linkData.title,
                    url: linkData.url,
                    bonkReward: parseInt(linkData.bonkReward),
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    createdBy: adminId,
                    settings: {
                        minViewTime: parseInt(linkData.minViewTime) || 10
                    },
                    stats: {
                        totalClicks: 0,
                        uniqueClicks: 0,
                        bonkPaid: 0
                    }
                };

                data.shortlinks.push(newLink);
                await DATABASE.api.updateData(data);
                return newLink;
            } catch (error) {
                console.error('Shortlink creation error:', error);
                return null;
            }
        },

        async createTask(adminId, taskData) {
            try {
                const data = await DATABASE.api.getAllData();
                
                const newTask = {
                    id: Date.now().toString(),
                    title: taskData.title,
                    description: taskData.description,
                    bonkReward: parseInt(taskData.bonkReward),
                    type: taskData.type,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    createdBy: adminId,
                    settings: {
                        proofRequired: taskData.proofRequired || false,
                        requirements: taskData.requirements || []
                    },
                    stats: {
                        totalCompletions: 0,
                        bonkPaid: 0
                    }
                };

                data.tasks.push(newTask);
                await DATABASE.api.updateData(data);
                return newTask;
            } catch (error) {
                console.error('Task creation error:', error);
                return null;
            }
        }
    },

    activity: {
        async recordPtcView(userId, adId) {
            try {
                const data = await DATABASE.api.getAllData();
                const ad = data.ptcAds.find(a => a.id === adId);
                if (!ad || ad.status !== 'active') return false;

                const user = data.users[userId];
                if (!user) return false;

                const today = new Date().toISOString().split('T')[0];
                if (!user.viewedAds) user.viewedAds = [];
                
                const todayViews = user.viewedAds.filter(v => v.date === today).length;
                if (todayViews >= ad.settings.dailyLimit) return false;

                user.viewedAds.push({
                    adId,
                    date: today,
                    timestamp: new Date().toISOString()
                });

                ad.stats.totalViews++;
                if (!user.viewedAds.some(v => v.adId === adId && v.date !== today)) {
                    ad.stats.uniqueViews++;
                }
                ad.stats.bonkPaid += ad.bonkReward;

                await DATABASE.users.updateUserBalance(userId, ad.bonkReward);
                await DATABASE.api.updateData(data);
                return true;
            } catch (error) {
                console.error('PTC view record error:', error);
                return false;
            }
        },

        async recordShortlinkClick(userId, linkId) {
            try {
                const data = await DATABASE.api.getAllData();
                const link = data.shortlinks.find(l => l.id === linkId);
                if (!link || link.status !== 'active') return false;

                const user = data.users[userId];
                if (!user) return false;

                if (!user.clickedLinks)
                    user.clickedLinks = [];
                const today = new Date().toISOString().split('T')[0];

                // Record click
                user.clickedLinks.push({
                    linkId,
                    date: today,
                    timestamp: new Date().toISOString()
                });

                // Update link stats
                link.stats.totalClicks++;
                if (!user.clickedLinks.some(c => c.linkId === linkId && c.date !== today)) {
                    link.stats.uniqueClicks++;
                }
                link.stats.bonkPaid += link.bonkReward;

                // Update user balance
                await DATABASE.users.updateUserBalance(userId, link.bonkReward);
                await DATABASE.api.updateData(data);
                return true;
            } catch (error) {
                console.error('Shortlink click record error:', error);
                return false;
            }
        },

        async recordTaskCompletion(userId, taskId, proof = null) {
            try {
                const data = await DATABASE.api.getAllData();
                const task = data.tasks.find(t => t.id === taskId);
                if (!task || task.status !== 'active') return false;

                const user = data.users[userId];
                if (!user) return false;

                if (!user.completedTasks) user.completedTasks = [];
                if (user.completedTasks.some(t => t.taskId === taskId)) return false;

                // Record completion
                user.completedTasks.push({
                    taskId,
                    proof,
                    date: new Date().toISOString()
                });

                // Update task stats
                task.stats.totalCompletions++;
                task.stats.bonkPaid += task.bonkReward;

                // Update user balance
                await DATABASE.users.updateUserBalance(userId, task.bonkReward);
                await DATABASE.api.updateData(data);
                return true;
            } catch (error) {
                console.error('Task completion record error:', error);
                return false;
            }
        }
    },

    earnings: {
        async getDailyEarnings(userId) {
            try {
                const user = await DATABASE.users.getUser(userId);
                if (!user) return 0;

                const today = new Date().toISOString().split('T')[0];
                return user.earnings?.daily?.[today] || 0;
            } catch (error) {
                console.error('Daily earnings check error:', error);
                return 0;
            }
        },

        async getEarningsHistory(userId) {
            try {
                const user = await DATABASE.users.getUser(userId);
                if (!user) return [];

                const history = [];
                for (const [date, amount] of Object.entries(user.earnings?.daily || {})) {
                    history.push({
                        date,
                        amount,
                        dollarValue: amount * DATABASE.config.phantom.dollarPerBonk
                    });
                }

                return history.sort((a, b) => new Date(b.date) - new Date(a.date));
            } catch (error) {
                console.error('Earnings history error:', error);
                return [];
            }
        },

        async checkEarningLimit(userId) {
            try {
                const dailyEarnings = await this.getDailyEarnings(userId);
                return dailyEarnings < DATABASE.config.adminSettings.systemSettings.maxDailyEarnings;
            } catch (error) {
                console.error('Earning limit check error:', error);
                return false;
            }
        }
    },

    stats: {
        async updateGlobalStats() {
            try {
                const data = await DATABASE.api.getAllData();
                const today = new Date().toISOString().split('T')[0];

                // Calculate active users
                const activeUsers = Object.values(data.users).filter(user => {
                    const lastActivity = new Date(user.lastActivity);
                    const now = new Date();
                    const diffHours = (now - lastActivity) / (1000 * 60 * 60);
                    return diffHours <= 24;
                }).length;

                // Update global stats
                data.statistics.global.activeUsers = activeUsers;
                
                // Update daily stats
                if (!data.statistics.daily[today]) {
                    data.statistics.daily[today] = {
                        totalEarnings: 0,
                        activeUsers: 0,
                        completedTasks: 0,
                        ptcViews: 0,
                        shortlinkClicks: 0
                    };
                }

                data.statistics.daily[today].activeUsers = activeUsers;

                await DATABASE.api.updateData(data);
                return data.statistics;
            } catch (error) {
                console.error('Stats update error:', error);
                return null;
            }
        },

        async getUserStats(userId) {
            try {
                const user = await DATABASE.users.getUser(userId);
                if (!user) return null;

                return {
                    totalEarned: user.bonkBalance,
                    completedTasks: user.completedTasks?.length || 0,
                    viewedAds: user.viewedAds?.length || 0,
                    clickedLinks: user.clickedLinks?.length || 0,
                    dollarValue: user.bonkBalance * DATABASE.config.phantom.dollarPerBonk
                };
            } catch (error) {
                console.error('User stats error:', error);
                return null;
            }
        }
    }
};

// Node.js için export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DATABASE;
}
