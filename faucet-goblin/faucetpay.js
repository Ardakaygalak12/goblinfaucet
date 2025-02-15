// faucetpay.js
class FaucetPayDGB {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://faucetpay.io/api/v1';
        this.currency = 'DGB';
        this.logger = new Logger();
        this.referralBonus = 0.3; // 30% referral komisyonu
    }

    async getBalance() {
        try {
            const response = await fetch(`${this.baseUrl}/balance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: this.apiKey,
                    currency: this.currency
                })
            });

            const data = await response.json();
            this.logger.log('BALANCE_CHECK', {
                success: data.status === 200,
                balance: data.balance,
                currency: this.currency
            });

            return {
                success: data.status === 200,
                balance: data.balance || 0,
                message: data.message
            };
        } catch (error) {
            this.logger.error('BALANCE_CHECK_FAILED', error.message);
            return {
                success: false,
                balance: 0,
                message: 'Bakiye kontrol edilemedi'
            };
        }
    }

    async verifyAddress(address) {
        try {
            const response = await fetch(`${this.baseUrl}/checkaddress`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: this.apiKey,
                    address: address
                })
            });

            const data = await response.json();
            return {
                success: data.status === 200,
                message: data.message
            };
        } catch (error) {
            this.logger.error('ADDRESS_VERIFY_FAILED', error.message);
            return {
                success: false,
                message: 'Adres doğrulanamadı'
            };
        }
    }

    async sendPayment(address, amount, isReferral = false) {
        try {
            // Önce bakiye kontrolü
            const balance = await this.getBalance();
            if (!balance.success || balance.balance < amount) {
                this.logger.error('INSUFFICIENT_BALANCE', {
                    requested: amount,
                    available: balance.balance
                });
                return {
                    success: false,
                    message: 'Yetersiz bakiye'
                };
            }

            const response = await fetch(`${this.baseUrl}/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: this.apiKey,
                    to: address,
                    amount: amount,
                    currency: this.currency
                })
            });

            const data = await response.json();
            
            if (data.status === 200) {
                this.logger.log(isReferral ? 'REFERRAL_PAYMENT' : 'PAYMENT', {
                    to: address,
                    amount: amount,
                    success: true
                });

                return {
                    success: true,
                    amount: data.amount,
                    message: 'Ödeme başarılı'
                };
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            this.logger.error('PAYMENT_FAILED', {
                to: address,
                amount: amount,
                error: error.message
            });
            return {
                success: false,
                message: 'Ödeme başarısız: ' + error.message
            };
        }
    }
}

// Referans Yöneticisi
class ReferralManager {
    constructor() {
        this.storageKey = 'referralData';
        this.initStorage();
    }

    initStorage() {
        if (!localStorage.getItem(this.storageKey)) {
            localStorage.setItem(this.storageKey, JSON.stringify({
                referrals: {},
                earnings: {}
            }));
        }
    }

    generateReferralCode() {
        return 'REF_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }

    addReferral(referrerEmail, newUserEmail) {
        const data = JSON.parse(localStorage.getItem(this.storageKey));
        
        if (!data.referrals[referrerEmail]) {
            data.referrals[referrerEmail] = [];
        }
        
        data.referrals[referrerEmail].push({
            user: newUserEmail,
            joinDate: new Date().toISOString()
        });

        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    async processReferralBonus(referrerEmail, amount) {
        const bonusAmount = amount * 0.3; // 30% referral bonus
        
        const data = JSON.parse(localStorage.getItem(this.storageKey));
        
        if (!data.earnings[referrerEmail]) {
            data.earnings[referrerEmail] = 0;
        }
        
        data.earnings[referrerEmail] += bonusAmount;
        localStorage.setItem(this.storageKey, JSON.stringify(data));

        return bonusAmount;
    }

    getReferralStats(email) {
        const data = JSON.parse(localStorage.getItem(this.storageKey));
        return {
            referralCount: (data.referrals[email] || []).length,
            totalEarnings: data.earnings[email] || 0,
            referrals: data.referrals[email] || []
        };
    }
}

// Faucet Yöneticisi
class FaucetManager {
    constructor(apiKey) {
        this.faucetpay = new FaucetPayDGB(apiKey);
        this.referralManager = new ReferralManager();
        this.logger = this.faucetpay.logger;
        this.minPayout = 0.1; // Minimum ödeme miktarı
        this.maxPayout = 1.0; // Maksimum ödeme miktarı
    }

    async processClaim(userEmail, referrerEmail = null) {
        try {
            // Adres doğrulama
            const verifyResult = await this.faucetpay.verifyAddress(userEmail);
            if (!verifyResult.success) {
                return {
                    success: false,
                    message: 'Geçersiz FaucetPay adresi'
                };
            }

            // Ödeme miktarını belirle
            const amount = this.calculatePayout();

            // Ana ödemeyi gönder
            const paymentResult = await this.faucetpay.sendPayment(userEmail, amount);
            
            if (paymentResult.success && referrerEmail) {
                // Referans bonusunu hesapla ve gönder
                const bonusAmount = await this.referralManager.processReferralBonus(referrerEmail, amount);
                await this.faucetpay.sendPayment(referrerEmail, bonusAmount, true);
            }

            return paymentResult;

        } catch (error) {
            this.logger.error('CLAIM_FAILED', error.message);
            return {
                success: false,
                message: 'İşlem başarısız'
            };
        }
    }

    calculatePayout() {
        return Math.random() * (this.maxPayout - this.minPayout) + this.minPayout;
    }

    getUserStats(email) {
        return {
            ...this.referralManager.getReferralStats(email),
            claimHistory: this.getClaimHistory(email)
        };
    }

    getClaimHistory(email) {
        const claims = JSON.parse(localStorage.getItem('claims') || '[]');
        return claims.filter(claim => claim.email === email);
    }
}

// Logger Sınıfı
class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
    }

    log(type, data) {
        this.addLog({
            type,
            data,
            timestamp: new Date(),
            level: 'INFO'
        });
    }

    error(type, data) {
        this.addLog({
            type,
            data,
            timestamp: new Date(),
            level: 'ERROR'
        });
    }

    addLog(logEntry) {
        this.logs.unshift(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
        this.saveLogs();
    }

    saveLogs() {
        try {
            localStorage.setItem('faucet_logs', JSON.stringify(this.logs));
        } catch (error) {
            console.error('Log kaydetme hatası:', error);
        }
    }

    getLogs(type = null, level = null, limit = 50) {
        let filtered = this.logs;
        
        if (type) {
            filtered = filtered.filter(log => log.type === type);
        }
        
        if (level) {
            filtered = filtered.filter(log => log.level === level);
        }
        
        return filtered.slice(0, limit);
    }
}

// FaucetPay yöneticisini oluştur
const FAUCETPAY_API_KEY = 'a5a15c7cc4b4d4c6a0cab0cb5d2b2ce3388070028e2c5cf37284f627975cb9ed';
const faucetManager = new FaucetManager(FAUCETPAY_API_KEY);