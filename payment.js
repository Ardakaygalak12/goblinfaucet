const BONK_TOKEN_ADDRESS = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK Token

class PaymentSystem {
    constructor() {
        this.connection = new solanaWeb3.Connection("https://api.mainnet-beta.solana.com");
        this.adminWallet = null;
    }

    async initialize() {
        try {
            // Admin cüzdanını bağla
            const provider = window.phantom?.solana;
            if (provider?.isPhantom) {
                await provider.connect();
                this.adminWallet = provider;
            }
        } catch (error) {
            console.error("Wallet connection error:", error);
            throw new Error("Failed to initialize payment system");
        }
    }

    async processWithdrawal(userWalletAddress, amount) {
        try {
            if (!this.adminWallet) {
                throw new Error("Admin wallet not connected");
            }

            // BONK token için transfer talimatı oluştur
            const transaction = new solanaWeb3.Transaction().add(
                createTransferInstruction(
                    this.adminWallet.publicKey, // Gönderen (Admin cüzdanı)
                    new solanaWeb3.PublicKey(userWalletAddress), // Alıcı
                    this.adminWallet.publicKey,
                    amount * 100000 // BONK decimals'e göre çevir
                )
            );

            // Transaction'ı imzala ve gönder
            const signature = await this.adminWallet.signAndSendTransaction(transaction);
            
            // Transaction sonucunu bekle
            const confirmation = await this.connection.confirmTransaction(signature);
            
            if (confirmation.value.err) {
                throw new Error("Transaction failed");
            }

            return {
                success: true,
                signature,
                amount
            };

        } catch (error) {
            console.error("Payment processing error:", error);
            throw error;
        }
    }

    async checkTransactionStatus(signature) {
        try {
            const status = await this.connection.getSignatureStatus(signature);
            return status.value?.confirmationStatus === "finalized";
        } catch (error) {
            console.error("Transaction status check error:", error);
            return false;
        }
    }
}
