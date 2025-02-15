// database.js
const Database = {
    // Veri şemaları
    schemas: {
        users: {
            email: String,
            balance: Number,
            lastClaim: Date,
            referralCode: String,
            referredBy: String,
            totalEarned: Number,
            joinDate: Date
        },
        ptcAds: {
            id: String,
            title: String,
            url: String,
            duration: Number,
            reward: Number,
            views: Number,
            active: Boolean,
            createdAt: Date
        },
        shortlinks: {
            id: String,
            title: String,
            targetUrl: String,
            reward: Number,
            clicks: Number,
            active: Boolean,
            createdAt: Date
        },
        claims: {
            id: String,
            userId: String,
            type: String, // 'faucet', 'ptc', 'shortlink'
            amount: Number,
            timestamp: Date
        }
    },

    // Veritabanı işlemleri
    init() {
        // Veritabanını başlat
        if (!localStorage.getItem('db_users')) {
            localStorage.setItem('db_users', JSON.stringify([]));
        }
        if (!localStorage.getItem('db_ptcAds')) {
            localStorage.setItem('db_ptcAds', JSON.stringify([]));
        }
        if (!localStorage.getItem('db_shortlinks')) {
            localStorage.setItem('db_shortlinks', JSON.stringify([]));
        }
        if (!localStorage.getItem('db_claims')) {
            localStorage.setItem('db_claims', JSON.stringify([]));
        }
    },

    // Kullanıcı işlemleri
    users: {
        create(userData) {
            const users = JSON.parse(localStorage.getItem('db_users'));
            const newUser = {
                ...userData,
                balance: 0,
                lastClaim: new Date(),
                referralCode: Math.random().toString(36).substring(7),
                totalEarned: 0,
                joinDate: new Date()
            };
            users.push(newUser);
            localStorage.setItem('db_users', JSON.stringify(users));
            return newUser;
        },

        findByEmail(email) {
            const users = JSON.parse(localStorage.getItem('db_users'));
            return users.find(user => user.email === email);
        },

        updateBalance(email, amount) {
            const users = JSON.parse(localStorage.getItem('db_users'));
            const userIndex = users.findIndex(user => user.email === email);
            if (userIndex !== -1) {
                users[userIndex].balance += amount;
                users[userIndex].totalEarned += amount;
                localStorage.setItem('db_users', JSON.stringify(users));
                return users[userIndex];
            }
            return null;
        }
    },

    // PTC reklamları işlemleri
    ptcAds: {
        create(adData) {
            const ads = JSON.parse(localStorage.getItem('db_ptcAds'));
            const newAd = {
                ...adData,
                id: Math.random().toString(36).substring(7),
                views: 0,
                active: true,
                createdAt: new Date()
            };
            ads.push(newAd);
            localStorage.setItem('db_ptcAds', JSON.stringify(ads));
            return newAd;
        },

        getActive() {
            const ads = JSON.parse(localStorage.getItem('db_ptcAds'));
            return ads.filter(ad => ad.active);
        },

        markViewed(adId, userEmail) {
            const ads = JSON.parse(localStorage.getItem('db_ptcAds'));
            const claims = JSON.parse(localStorage.getItem('db_claims'));
            
            const adIndex = ads.findIndex(ad => ad.id === adId);
            if (adIndex !== -1) {
                ads[adIndex].views += 1;
                localStorage.setItem('db_ptcAds', JSON.stringify(ads));

                // Ödeme kaydı oluştur
                const claim = {
                    id: Math.random().toString(36).substring(7),
                    userId: userEmail,
                    type: 'ptc',
                    amount: ads[adIndex].reward,
                    timestamp: new Date()
                };
                claims.push(claim);
                localStorage.setItem('db_claims', JSON.stringify(claims));

                // Kullanıcı bakiyesini güncelle
                this.users.updateBalance(userEmail, ads[adIndex].reward);
                
                return true;
            }
            return false;
        }
    },

    // Shortlink işlemleri
    shortlinks: {
        create(linkData) {
            const links = JSON.parse(localStorage.getItem('db_shortlinks'));
            const newLink = {
                ...linkData,
                id: Math.random().toString(36).substring(7),
                clicks: 0,
                active: true,
                createdAt: new Date()
            };
            links.push(newLink);
            localStorage.setItem('db_shortlinks', JSON.stringify(links));
            return newLink;
        },

        getActive() {
            const links = JSON.parse(localStorage.getItem('db_shortlinks'));
            return links.filter(link => link.active);
        },

        markCompleted(linkId, userEmail) {
            const links = JSON.parse(localStorage.getItem('db_shortlinks'));
            const claims = JSON.parse(localStorage.getItem('db_claims'));
            
            const linkIndex = links.findIndex(link => link.id === linkId);
            if (linkIndex !== -1) {
                links[linkIndex].clicks += 1;
                localStorage.setItem('db_shortlinks', JSON.stringify(links));

                // Ödeme kaydı oluştur
                const claim = {
                    id: Math.random().toString(36).substring(7),
                    userId: userEmail,
                    type: 'shortlink',
                    amount: links[linkIndex].reward,
                    timestamp: new Date()
                };
                claims.push(claim);
                localStorage.setItem('db_claims', JSON.stringify(claims));

                // Kullanıcı bakiyesini güncelle
                this.users.updateBalance(userEmail, links[linkIndex].reward);
                
                return true;
            }
            return false;
        }
    },

    // İstatistik işlemleri
    stats: {
        getDailyStats() {
            const claims = JSON.parse(localStorage.getItem('db_claims'));
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const dailyClaims = claims.filter(claim => {
                const claimDate = new Date(claim.timestamp);
                claimDate.setHours(0, 0, 0, 0);
                return claimDate.getTime() === today.getTime();
            });

            return {
                totalClaims: dailyClaims.length,
                totalAmount: dailyClaims.reduce((sum, claim) => sum + claim.amount, 0)
            };
        },

        getUserStats(email) {
            const claims = JSON.parse(localStorage.getItem('db_claims'));
            const userClaims = claims.filter(claim => claim.userId === email);

            return {
                totalClaims: userClaims.length,
                totalEarned: userClaims.reduce((sum, claim) => sum + claim.amount, 0),
                claimsByType: {
                    faucet: userClaims.filter(claim => claim.type === 'faucet').length,
                    ptc: userClaims.filter(claim => claim.type === 'ptc').length,
                    shortlink: userClaims.filter(claim => claim.type === 'shortlink').length
                }
            };
        }
    }
};

// Veritabanını başlat
Database.init();