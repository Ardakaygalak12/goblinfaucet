// database.js
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
                minWithdrawAmount: 20 * 100,
                maxDailyEarnings: 5000,
                maxDailyWithdrawals: 1,
                referralBonus: 1000
            }
        },
        phantom: {
            network: 'mainnet-beta',
            rpcUrl: 'https://api.mainnet-beta.solana.com',
            bonkMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
            bonkDecimals: 5,
            dollarPerBonk: 0.00001234
        }
    },

    api: {
        baseUrl: 'https://api.jsonbin.io/v3/b',
        headers: null,

        initHeaders() {
            this.headers = {
                'Content-Type': 'application/json',
                'X-Master-Key': DATABASE.config.apiKey,
                'X-Bin-Meta': false
            };
        },

        async getAllData() {
            try {
                if (!this.headers) this.initHeaders();
                
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}/latest`, {
                    headers: this.headers,
                    method: 'GET'
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                return data.record || this.getDefaultData();
            } catch (error) {
                console.error('Veri çekme hatası:', error);
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
                if (!this.headers) this.initHeaders();
                if (!data) throw new Error('Güncellenecek veri gerekli');
                
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}`, {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                return result;
            } catch (error) {
                console.error('Veri güncelleme hatası:', error);
                return null;
            }
        }
    },

    users: {
        async getUser(userId) {
            if (!userId) throw new Error('Kullanıcı ID gerekli');
            
            const data = await DATABASE.api.getAllData();
            return data.users[userId] || null;
        },

        async createUser(userData) {
            if (!userData || !userData.userId || !userData.email) {
                throw new Error('Geçersiz kullanıcı verisi');
            }

            try {
                const data = await DATABASE.api.getAllData();
                
                if (data.users[userData.userId]) {
                    throw new Error('Bu kullanıcı zaten mevcut');
                }

                const newUser = {
                    userId: userData.userId,
                    email: userData.email,
                    phantomWallet: userData.phantomWallet || null,
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
                
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('Kullanıcı kaydedilemedi');
                
                return newUser;
            } catch (error) {
                console.error('Kullanıcı oluşturma hatası:', error);
                throw error;
            }
        },

        async updateUserBalance(userId, amount) {
            if (!userId || typeof amount !== 'number') {
                throw new Error('Geçersiz parametreler');
            }

            try {
                const data = await DATABASE.api.getAllData();
                if (!data.users[userId]) return false;

                const user = data.users[userId];
                const oldBalance = user.bonkBalance || 0;
                user.bonkBalance = oldBalance + amount;
                
                if (user.bonkBalance < 0) user.bonkBalance = 0;

                const today = new Date().toISOString().split('T')[0];
                if (!user.earnings.daily[today]) {
                    user.earnings.daily[today] = 0;
                }
                if (amount > 0) {
                    user.earnings.daily[today] += amount;
                }

                user.lastActivity = new Date().toISOString();
                data.statistics.global.totalBonk += amount;

                const updateResult = await DATABASE.api.updateData(data);
                return !!updateResult;
            } catch (error) {
                console.error('Bakiye güncelleme hatası:', error);
                return false;
            }
        },

        async updatePhantomWallet(userId, walletAddress) {
            if (!userId || !walletAddress) {
                throw new Error('Kullanıcı ID ve cüzdan adresi gerekli');
            }

            try {
                const data = await DATABASE.api.getAllData();
                if (!data.users[userId]) return false;

                data.users[userId].phantomWallet = walletAddress;
                const updateResult = await DATABASE.api.updateData(data);
                return !!updateResult;
            } catch (error) {
                console.error('Cüzdan güncelleme hatası:', error);
                return false;
            }
        }
    },

    phantom: {
        async connectWallet() {
            if (typeof window === 'undefined' || !window.solana || !window.solana.isPhantom) {
                throw new Error('Phantom cüzdan yüklü değil!');
            }

            try {
                const response = await window.solana.connect();
                return response.publicKey.toString();
            } catch (error) {
                console.error('Phantom bağlantı hatası:', error);
                throw error;
            }
        },

        async initiateWithdrawal(userId, amountInDollars) {
            try {
                if (!userId || typeof amountInDollars !== 'number') {
                    throw new Error('Geçersiz parametreler');
                }

                const user = await DATABASE.users.getUser(userId);
                if (!user) throw new Error('Kullanıcı bulunamadı');

                const today = new Date().toISOString().split('T')[0];
                const withdrawalCount = await this.getDailyWithdrawalCount(userId, today);
                
                if (withdrawalCount >= DATABASE.config.adminSettings.systemSettings.maxDailyWithdrawals) {
                    throw new Error('Günlük çekim limiti aşıldı');
                }

                if (amountInDollars < (DATABASE.config.adminSettings.systemSettings.minWithdrawAmount / 100)) {
                    throw new Error(`Minimum çekim tutarı $${DATABASE.config.adminSettings.systemSettings.minWithdrawAmount / 100}`);
                }

                const bonkAmount = Math.floor(amountInDollars / DATABASE.config.phantom.dollarPerBonk);

                if (user.bonkBalance < bonkAmount) {
                    throw new Error('Yetersiz bakiye');
                }

                if (!user.phantomWallet) {
                    throw new Error('Phantom cüzdan bağlı değil');
                }

                if (!window.solana || !window.solanaWeb3 || !window.splToken) {
                    throw new Error('Gerekli web3 kütüphaneleri yüklü değil');
                }

                const connection = new window.solanaWeb3.Connection(
                    DATABASE.config.phantom.rpcUrl,
                    'confirmed'
                );

                const transaction = new window.solanaWeb3.Transaction();
                
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
                console.error('Çekim başlatma hatası:', error);
                throw error;
            }
        },

        async completeWithdrawal(userId, withdrawalId, signature) {
            try {
                if (!userId || !withdrawalId || !signature) {
                    throw new Error('Geçersiz parametreler');
                }

                const data = await DATABASE.api.getAllData();
                const withdrawal = data.withdrawals[userId]?.find(w => w.withdrawalId === withdrawalId);
                
                if (!withdrawal) throw new Error('Çekim kaydı bulunamadı');
                if (withdrawal.status === 'completed') throw new Error('Bu çekim zaten tamamlanmış');

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
                    throw new Error('İşlem onaylanmadı');
                }
            } catch (error) {
                console.error('Çekim tamamlama hatası:', error);
                throw error;
            }
        },

        async getDailyWithdrawalCount(userId, date) {
            if (!userId || !date) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                return (data.withdrawals[userId] || [])
                    .filter(w => w.date === date && w.status === 'completed')
                    .length;
            } catch (error) {
                console.error('Çekim sayısı kontrol hatası:', error);
                return 0;
            }
        },

        async saveWithdrawalRecord(userId, record) {
            if (!userId || !record) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                if (!data.withdrawals[userId]) {
                    data.withdrawals[userId] = [];
                }
                data.withdrawals[userId].push(record);
                await DATABASE.api.updateData(data);
            } catch (error) {
                console.error('Çekim kaydı oluşturma hatası:', error);
                throw error;
            }
        },

        async getWithdrawalHistory(userId) {
            if (!userId) throw new Error('Kullanıcı ID gerekli');

            try {
                const data = await DATABASE.api.getAllData();
                return data.withdrawals[userId] || [];
            } catch (error) {
                console.error('Çekim geçmişi çekme hatası:', error);
                return [];
            }
        }
    },

    contentManagement: {
        async createPtcAd(adminId, adData) {
            if (!adminId || !adData) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                
                const newAd = {
                    id: `ad_${Date.now()}`,
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
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('PTC reklamı kaydedilemedi');

                return newAd;
            } catch (error) {
                console.error('PTC reklam oluşturma hatası:', error);
                throw error;
            }
        },

        async createShortlink(adminId, linkData) {
            if (!adminId || !linkData) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                
                const newLink = {id: `link_${Date.now()}`,
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
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('Shortlink kaydedilemedi');

                return newLink;
            } catch (error) {
                console.error('Shortlink oluşturma hatası:', error);
                throw error;
            }
        },

        async createTask(adminId, taskData) {
            if (!adminId || !taskData) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                
                const newTask = {
                    id: `task_${Date.now()}`,
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
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('Görev kaydedilemedi');

                return newTask;
            } catch (error) {
                console.error('Görev oluşturma hatası:', error);
                throw error;
            }
        },

        async updateContent(type, id, updateData) {
            if (!type || !id || !updateData) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                let contentArray;

                switch(type) {
                    case 'ptcAd':
                        contentArray = data.ptcAds;
                        break;
                    case 'shortlink':
                        contentArray = data.shortlinks;
                        break;
                    case 'task':
                        contentArray = data.tasks;
                        break;
                    default:
                        throw new Error('Geçersiz içerik tipi');
                }

                const index = contentArray.findIndex(item => item.id === id);
                if (index === -1) throw new Error('İçerik bulunamadı');

                contentArray[index] = { ...contentArray[index], ...updateData };
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('İçerik güncellenemedi');

                return contentArray[index];
            } catch (error) {
                console.error('İçerik güncelleme hatası:', error);
                throw error;
            }
        },

        async deleteContent(type, id) {
            if (!type || !id) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                let contentArray;

                switch(type) {
                    case 'ptcAd':
                        contentArray = data.ptcAds;
                        break;
                    case 'shortlink':
                        contentArray = data.shortlinks;
                        break;
                    case 'task':
                        contentArray = data.tasks;
                        break;
                    default:
                        throw new Error('Geçersiz içerik tipi');
                }

                const index = contentArray.findIndex(item => item.id === id);
                if (index === -1) throw new Error('İçerik bulunamadı');

                contentArray.splice(index, 1);
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('İçerik silinemedi');

                return true;
            } catch (error) {
                console.error('İçerik silme hatası:', error);
                throw error;
            }
        }
    },

    activity: {
        async recordPtcView(userId, adId) {
            if (!userId || !adId) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                const ad = data.ptcAds.find(a => a.id === adId);
                if (!ad || ad.status !== 'active') throw new Error('Reklam bulunamadı veya aktif değil');

                const user = data.users[userId];
                if (!user) throw new Error('Kullanıcı bulunamadı');

                const today = new Date().toISOString().split('T')[0];
                if (!user.viewedAds) user.viewedAds = [];
                
                const todayViews = user.viewedAds.filter(v => v.date === today).length;
                if (todayViews >= ad.settings.dailyLimit) {
                    throw new Error('Günlük görüntüleme limiti aşıldı');
                }

                // Kazanç limiti kontrolü
                const canEarn = await DATABASE.earnings.checkEarningLimit(userId);
                if (!canEarn) throw new Error('Günlük kazanç limiti aşıldı');

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
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('Görüntüleme kaydedilemedi');

                return true;
            } catch (error) {
                console.error('PTC görüntüleme kayıt hatası:', error);
                throw error;
            }
        },

        async recordShortlinkClick(userId, linkId) {
            if (!userId || !linkId) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                const link = data.shortlinks.find(l => l.id === linkId);
                if (!link || link.status !== 'active') throw new Error('Link bulunamadı veya aktif değil');

                const user = data.users[userId];
                if (!user) throw new Error('Kullanıcı bulunamadı');

                if (!user.clickedLinks) user.clickedLinks = [];
                const today = new Date().toISOString().split('T')[0];

                // Kazanç limiti kontrolü
                const canEarn = await DATABASE.earnings.checkEarningLimit(userId);
                if (!canEarn) throw new Error('Günlük kazanç limiti aşıldı');

                user.clickedLinks.push({
                    linkId,
                    date: today,
                    timestamp: new Date().toISOString()
                });

                link.stats.totalClicks++;
                if (!user.clickedLinks.some(c => c.linkId === linkId && c.date !== today)) {
                    link.stats.uniqueClicks++;
                }
                link.stats.bonkPaid += link.bonkReward;

                await DATABASE.users.updateUserBalance(userId, link.bonkReward);
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('Tıklama kaydedilemedi');

                return true;
            } catch (error) {
                console.error('Shortlink tıklama kayıt hatası:', error);
                throw error;
            }
        },

        async recordTaskCompletion(userId, taskId, proof = null) {
            if (!userId || !taskId) throw new Error('Geçersiz parametreler');

            try {
                const data = await DATABASE.api.getAllData();
                const task = data.tasks.find(t => t.id === taskId);
                if (!task || task.status !== 'active') throw new Error('Görev bulunamadı veya aktif değil');

                const user = data.users[userId];
                if (!user) throw new Error('Kullanıcı bulunamadı');

                if (!user.completedTasks) user.completedTasks = [];
                if (user.completedTasks.some(t => t.taskId === taskId)) {
                    throw new Error('Bu görev zaten tamamlanmış');
                }

                // Kazanç limiti kontrolü
                const canEarn = await DATABASE.earnings.checkEarningLimit(userId);
                if (!canEarn) throw new Error('Günlük kazanç limiti aşıldı');

                if (task.settings.proofRequired && !proof) {
                    throw new Error('Görev kanıtı gerekli');
                }

                user.completedTasks.push({
                    taskId,
                    proof,
                    date: new Date().toISOString()
                });

                task.stats.totalCompletions++;
                task.stats.bonkPaid += task.bonkReward;

                await DATABASE.users.updateUserBalance(userId, task.bonkReward);
                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('Görev tamamlama kaydedilemedi');

                return true;
            } catch (error) {
                console.error('Görev tamamlama kayıt hatası:', error);
                throw error;
            }
        }
    },

    earnings: {
        async getDailyEarnings(userId) {
            if (!userId) throw new Error('Kullanıcı ID gerekli');

            try {
                const user = await DATABASE.users.getUser(userId);
                if (!user) throw new Error('Kullanıcı bulunamadı');

                const today = new Date().toISOString().split('T')[0];
                return user.earnings?.daily?.[today] || 0;
            } catch (error) {
                console.error('Günlük kazanç kontrolü hatası:', error);
                return 0;
            }
        },

        async getEarningsHistory(userId) {
            if (!userId) throw new Error('Kullanıcı ID gerekli');

            try {
                const user = await DATABASE.users.getUser(userId);
                if (!user) throw new Error('Kullanıcı bulunamadı');

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
                console.error('Kazanç geçmişi çekme hatası:', error);
                return [];
            }
        },

        async checkEarningLimit(userId) {
            if (!userId) throw new Error('Kullanıcı ID gerekli');

            try {
                const dailyEarnings = await this.getDailyEarnings(userId);
                return dailyEarnings < DATABASE.config.adminSettings.systemSettings.maxDailyEarnings;
            } catch (error) {
                console.error('Kazanç limiti kontrolü hatası:', error);
                return false;
            }
        }
    },

    stats: {
        async updateGlobalStats() {
            try {
                const data = await DATABASE.api.getAllData();
                const today = new Date().toISOString().split('T')[0];

                // Aktif kullanıcıları hesapla
                const activeUsers = Object.values(data.users).filter(user => {
                    const lastActivity = new Date(user.lastActivity);
                    const now = new Date();
                    const diffHours = (now - lastActivity) / (1000 * 60 * 60);
                    return diffHours <= 24;
                }).length;

                // Global istatistikleri güncelle
                data.statistics.global.activeUsers = activeUsers;
                
                // Günlük istatistikleri güncelle
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

                const updateResult = await DATABASE.api.updateData(data);
                if (!updateResult) throw new Error('İstatistikler güncellenemedi');

                return data.statistics;
            } catch (error) {
                console.error('İstatistik güncelleme hatası:', error);
                throw error;
            }
        },

        async getUserStats(userId) {
            if (!userId) throw new Error('Kullanıcı ID gerekli');

            try {
                const user = await DATABASE.users.getUser(userId);
                if (!user) throw new Error('Kullanıcı bulunamadı');

                return {
                    totalEarned: user.bonkBalance,
                    completedTasks: user.completedTasks?.length || 0,
                    viewedAds: user.viewedAds?.length || 0,
                    clickedLinks: user.clickedLinks?.length || 0,
                    dollarValue: user.bonkBalance * DATABASE.config.phantom.dollarPerBonk
                };
            } catch (error) {
                console.error('Kullanıcı istatistikleri çekme hatası:', error);
                return null;
            }
        }
    },

    init() {
        // Database'i initialize et
        this.api.initHeaders();
        
        // Global hata yakalayıcı
        if (typeof window !== 'undefined') {
            window.onerror = function(msg, url, line, col, error) {
                console.error('Global hata:', {msg, url, line, col, error});
                return false;
            };

            // Bağlantı durumu kontrolü
            window.addEventListener('online', () => {
                console.log('İnternet bağlantısı kuruldu');
                this.api.getAllData(); // Verileri yenile
            });

            window.addEventListener('offline', () => {
                console.log('İnternet bağlantısı kesildi');
            });
        }

        return this;
    },

    utils: {
        generateId(prefix = 'id') {
            return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        },

        validateEmail(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        },

        validateWalletAddress(address) {
            // Solana cüzdan adresi validasyonu
            return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
        },

        async sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        async retry(fn, maxAttempts = 3, delay = 1000) {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    return await fn();
                } catch (error) {
                    if (attempt === maxAttempts) throw error;
                    await this.sleep(delay * attempt);
                }
            }
        },

        formatBonkAmount(amount) {
            return amount.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        },

        formatDollarAmount(bonkAmount) {
            const dollarValue = bonkAmount * DATABASE.config.phantom.dollarPerBonk;
            return dollarValue.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD'
            });
        },

        getDateString(date = new Date()) {
            return date.toISOString().split('T')[0];
        },

        validateUrl(url) {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        }
    },

    async checkSystemStatus() {
        try {
            // API bağlantı kontrolü
            const apiCheck = await this.api.getAllData();
            if (!apiCheck) throw new Error('API bağlantısı başarısız');

            // Phantom cüzdan kontrolü
            const phantomCheck = typeof window !== 'undefined' && 
                               window.solana && 
                               window.solana.isPhantom;

            // Web3 kütüphaneleri kontrolü
            const web3Check = typeof window !== 'undefined' && 
                            window.solanaWeb3 && 
                            window.splToken;

            return {
                status: 'operational',
                api: !!apiCheck,
                phantom: phantomCheck,
                web3: web3Check,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Sistem durum kontrolü hatası:', error);
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    },

    errorHandler: {
        handle(error, context = '') {
            console.error(`Hata [${context}]:`, error);

            let userMessage = 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.';
            let errorCode = 'UNKNOWN_ERROR';

            if (error.message.includes('Yetersiz bakiye')) {
                userMessage = 'Hesabınızda yeterli BONK bulunmuyor.';
                errorCode = 'INSUFFICIENT_BALANCE';
            } else if (error.message.includes('Günlük limit')) {
                userMessage = 'Günlük işlem limitinize ulaştınız.';
                errorCode = 'DAILY_LIMIT_REACHED';
            } else if (error.message.includes('bulunamadı')) {
                userMessage = 'İstenen kayıt bulunamadı.';
                errorCode = 'NOT_FOUND';
            } else if (error.message.includes('Phantom')) {
                userMessage = 'Phantom cüzdan bağlantısında bir sorun oluştu.';
                errorCode = 'PHANTOM_ERROR';
            } else if (error.message.includes('HTTP error')) {
                userMessage = 'Sunucu bağlantısında bir sorun oluştu.';
                errorCode = 'API_ERROR';
            }

            return {
                message: userMessage,
                code: errorCode,
                originalError: error.message
            };
        }
    }
};

// Otomatik başlatma
if (typeof window !== 'undefined') {
    DATABASE.init();
}

// Node.js için export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DATABASE;
}
