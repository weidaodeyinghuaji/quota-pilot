use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingProfile {
    pub currency: String,
    pub quota_unit_per_usd: f64,
    pub initial_balance: Option<f64>,
    pub input_price_per_million: f64,
    pub cached_input_price_per_million: f64,
    pub output_price_per_million: f64,
    pub model_ratio: f64,
    pub completion_ratio: f64,
    pub group_ratio: f64,
    pub safety_multiplier: f64,
}

pub fn estimate_token_cost(
    input_tokens: f64,
    cached_input_tokens: f64,
    output_tokens: f64,
    profile: &PricingProfile,
) -> f64 {
    let base = input_tokens / 1_000_000.0 * profile.input_price_per_million
        + cached_input_tokens / 1_000_000.0 * profile.cached_input_price_per_million
        + output_tokens / 1_000_000.0 * profile.output_price_per_million;

    base * positive_or_one(profile.model_ratio)
        * positive_or_one(profile.group_ratio)
        * positive_or_one(profile.safety_multiplier)
}

pub fn estimate_quota_cost(
    input_tokens: f64,
    cached_input_tokens: f64,
    output_tokens: f64,
    profile: &PricingProfile,
) -> f64 {
    (input_tokens + cached_input_tokens + output_tokens * positive_or_one(profile.completion_ratio))
        * positive_or_one(profile.model_ratio)
        * positive_or_one(profile.group_ratio)
        * positive_or_one(profile.safety_multiplier)
}

fn positive_or_one(value: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        1.0
    }
}
