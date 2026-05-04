/**
 * PayMongo Payment Frontend Handler
 * Manages checkout flow, plan selection, and payment status
 */

class PayMongoCheckout {
  constructor() {
    this.checkoutUrl = null;
    this.currentPlan = null;
  }

  /**
   * Fetch all available plans from API
   * Accepts optional currency parameter
   */
  async loadPlans(currency = 'USD') {
    try {
      const response = await fetch(`/api/payment/plans?currency=${currency}`, {
        headers: {
          'Accept': 'application/json',
        },
      });
      const data = await response.json();

      if (!data.success) {
        console.error('[PayMongo] Failed to load plans:', data.error);
        return [];
      }

      return data.plans || [];
    } catch (err) {
      console.error('[PayMongo] Load plans error:', err.message);
      return [];
    }
  }

  /**
   * Create a checkout session for the selected plan
   */
  async createCheckout(planId, currency = 'USD') {
    try {
      console.log('[PayMongo] Creating checkout for plan:', planId, 'currency:', currency);

      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ planId, currency }),
      });

      const data = await response.json();

      if (!data.success) {
        this.showError('Checkout creation failed: ' + (data.error || 'Unknown error'));
        console.error('[PayMongo] Checkout error:', data.error);
        return null;
      }

      console.log('[PayMongo] Checkout created:', data.checkoutId);
      this.checkoutUrl = data.paymentLink;
      this.currentPlan = data.plan;

      return data;
    } catch (err) {
      this.showError('Checkout error: ' + err.message);
      console.error('[PayMongo] Checkout exception:', err.message);
      return null;
    }
  }

  /**
   * Redirect to PayMongo checkout
   */
  redirectToCheckout(checkoutUrl) {
    if (!checkoutUrl) {
      this.showError('No checkout URL available');
      return;
    }

    console.log('[PayMongo] Redirecting to checkout:', checkoutUrl);
    window.location.href = checkoutUrl;
  }

  /**
   * Handle upgrade button click
   */
  async handleUpgrade(planId, currency = 'USD') {
    // Disable button to prevent double-click
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      // For starter plan (free), just upgrade without payment
      if (planId === 'starter') {
        await this.upgradePlanDirect(planId);
        return;
      }

      // For paid plans, create checkout
      const checkoutData = await this.createCheckout(planId, currency);
      if (checkoutData && checkoutData.paymentLink) {
        this.redirectToCheckout(checkoutData.paymentLink);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  /**
   * Direct plan upgrade (for free plans or admin)
   */
  async upgradePlanDirect(planId) {
    try {
      const response = await fetch('/api/payment/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (!data.success) {
        this.showError('Upgrade failed: ' + (data.error || 'Unknown error'));
        return;
      }

      this.showSuccess('Successfully upgraded to ' + (data.plan || planId) + ' plan');

      // Reload page after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      this.showError('Upgrade error: ' + err.message);
      console.error('[PayMongo] Upgrade exception:', err.message);
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(checkoutId) {
    try {
      const response = await fetch(`/api/payment/checkout/${checkoutId}`, {
        headers: {
          'Accept': 'application/json',
        },
      });
      const data = await response.json();

      if (!data.success) {
        console.error('[PayMongo] Status check failed:', data.error);
        return null;
      }

      console.log('[PayMongo] Checkout status:', data.checkout.status);
      return data.checkout;
    } catch (err) {
      console.error('[PayMongo] Status check error:', err.message);
      return null;
    }
  }

  /**
   * Show error message to user
   */
  showError(message) {
    const alertBox = document.getElementById('alertBox') || document.querySelector('[data-alert]');
    if (alertBox) {
      alertBox.className = 'alert alert-error';
      alertBox.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${message}`;
      alertBox.style.display = 'block';
    } else {
      alert(message);
    }
    console.error('[PayMongo] Error:', message);
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    const alertBox = document.getElementById('alertBox') || document.querySelector('[data-alert]');
    if (alertBox) {
      alertBox.className = 'alert alert-success';
      alertBox.innerHTML = `<i class="bi bi-check-circle"></i> ${message}`;
      alertBox.style.display = 'block';
    }
    console.log('[PayMongo] Success:', message);
  }

  /**
   * Render pricing plans in the DOM
   */
  async renderPlans(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('[PayMongo] Container not found:', containerId);
      return;
    }

    // Get selected currency
    const currencySelector = document.getElementById('currencySelector');
    const selectedCurrency = currencySelector?.value || 'USD';

    const plans = await this.loadPlans(selectedCurrency);
    if (!plans || plans.length === 0) {
      container.innerHTML = '<p class="text-center">Failed to load pricing plans</p>';
      return;
    }

    let html = '<div class="pricing-grid">';

    // Currency symbols map
    const symbols = {
      USD: '$',
      PHP: '₱',
      EUR: '€',
      GBP: '£',
      AUD: '$',
      CAD: '$',
      INR: '₹',
      SGD: '$',
      HKD: 'HK$',
      JPY: '¥',
    };
    const symbol = symbols[selectedCurrency] || '$';

    plans.forEach((plan) => {
      const priceDisplay = plan.price === 0 ? 'Free' : `${symbol}${(plan.price).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
      const recommended = plan.recommended ? ' recommended' : '';
      const discountDisplay = plan.discount ? `<div style="color: #10B981; font-size: 0.85rem; margin-top: 4px;">💰 Save ${plan.discount}</div>` : '';
      
      if (plan.contactSales) {
        html += `
          <div class="pricing-card${recommended}">
            <div class="pricing-header">
              <h3>${plan.name}</h3>
              <p class="pricing-desc">${plan.description}</p>
              ${plan.badge ? `<span class="badge">${plan.badge}</span>` : ''}
            </div>
            <div class="pricing-body">
              <div class="price">
                <span class="amount">${priceDisplay}</span>
                ${plan.price > 0 ? `<span class="billing">/month</span>` : ''}
              </div>
              ${discountDisplay}
              <ul class="features">
                ${plan.features.map((f) => `<li><i class="bi bi-check"></i> ${f}</li>`).join('')}
              </ul>
            </div>
            <div class="pricing-footer">
              <button class="btn btn-outline" onclick="window.location='mailto:sales@liknaya.com'">
                Contact Sales
              </button>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="pricing-card${recommended}">
            <div class="pricing-header">
              <h3>${plan.name}</h3>
              <p class="pricing-desc">${plan.description}</p>
              ${plan.badge ? `<span class="badge">${plan.badge}</span>` : ''}
            </div>
            <div class="pricing-body">
              <div class="price">
                <span class="amount">${priceDisplay}</span>
                ${plan.price > 0 ? `<span class="billing">/month</span>` : ''}
              </div>
              ${discountDisplay}
              <ul class="features">
                ${plan.features.map((f) => `<li><i class="bi bi-check"></i> ${f}</li>`).join('')}
              </ul>
            </div>
            <div class="pricing-footer">
              <button class="btn btn-primary" onclick="paymongoCheckout.handleUpgrade('${plan.id}', '${selectedCurrency}')">
                ${plan.id === 'starter' ? 'Get Started Free' : 'Upgrade to ' + plan.name}
              </button>
            </div>
          </div>
        `;
      }
    });

    html += '</div>';
    container.innerHTML = html;
  }
      
      if (plan.contactSales) {
        html += `
          <div class="pricing-card${recommended}">
            <div class="pricing-header">
              <h3>${plan.name}</h3>
              <p class="pricing-desc">${plan.description}</p>
              ${plan.badge ? `<span class="badge">${plan.badge}</span>` : ''}
            </div>
            <div class="pricing-body">
              <div class="price">
                <span class="amount">${priceDisplay}</span>
                ${plan.price > 0 ? `<span class="billing">/month</span>` : ''}
              </div>
              ${discountDisplay}
              <ul class="features">
                ${plan.features.map((f) => `<li><i class="bi bi-check"></i> ${f}</li>`).join('')}
              </ul>
            </div>
            <div class="pricing-footer">
              <button class="btn btn-outline" onclick="window.location='mailto:sales@liknaya.com'">
                Contact Sales
              </button>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="pricing-card${recommended}">
            <div class="pricing-header">
              <h3>${plan.name}</h3>
              <p class="pricing-desc">${plan.description}</p>
              ${plan.badge ? `<span class="badge">${plan.badge}</span>` : ''}
            </div>
            <div class="pricing-body">
              <div class="price">
                <span class="amount">${priceDisplay}</span>
                ${plan.price > 0 ? `<span class="billing">/month</span>` : ''}
              </div>
              ${discountDisplay}
              <ul class="features">
                ${plan.features.map((f) => `<li><i class="bi bi-check"></i> ${f}</li>`).join('')}
              </ul>
            </div>
            <div class="pricing-footer">
              <button class="btn btn-primary" onclick="paymongoCheckout.handleUpgrade('${plan.id}')">
                ${plan.id === 'starter' ? 'Get Started Free' : 'Upgrade to ' + plan.name}
              </button>
            </div>
          </div>
        `;
      }
    });

    html += '</div>';
    container.innerHTML = html;
  }
}

// Initialize globally
const paymongoCheckout = new PayMongoCheckout();

// Handle currency selector changes
document.addEventListener('DOMContentLoaded', () => {
  const currencySelector = document.getElementById('currencySelector');
  if (currencySelector) {
    currencySelector.addEventListener('change', () => {
      console.log('[PayMongo] Currency changed to:', currencySelector.value);
      paymongoCheckout.renderPlans('pricingPlans');
    });
  }
});

// Check URL params for payment status
document.addEventListener('DOMContentLoaded', function () {
  const params = new URLSearchParams(window.location.search);

  if (params.get('upgraded') === 'true') {
    paymongoCheckout.showSuccess('✓ Plan upgraded successfully!');
    // Remove query params from URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get('cancelled') === 'true') {
    paymongoCheckout.showError('Payment was cancelled');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});
