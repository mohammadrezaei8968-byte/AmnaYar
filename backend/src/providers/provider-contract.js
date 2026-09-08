/**
 * Provider boundary used by production integrations.
 * Do not implement a provider by trusting a client-side "paid=true" flag.
 */
class PaymentProvider {
  constructor(name) { this.name = name; }
  async createPayment() { throw new Error(`${this.name}: createPayment not configured`); }
  async verifyPayment() { throw new Error(`${this.name}: verifyPayment not configured`); }
}
module.exports = { PaymentProvider };
