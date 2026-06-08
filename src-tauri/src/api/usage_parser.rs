use crate::models::UsageInfo;
use serde_json::Value;

pub fn parse_openai_usage(payload: &Value) -> UsageInfo {
    let usage = payload.get("usage").unwrap_or(&Value::Null);
    let details = usage
        .get("prompt_tokens_details")
        .unwrap_or(&Value::Null);

    UsageInfo {
        input_tokens: number_at(usage, "prompt_tokens"),
        cached_input_tokens: number_at(details, "cached_tokens"),
        cache_creation_input_tokens: None,
        output_tokens: number_at(usage, "completion_tokens"),
        total_tokens: number_at(usage, "total_tokens"),
        estimated_cost: None,
        currency: None,
        cost_source: Some("unavailable".to_string()),
    }
}

pub fn parse_anthropic_usage(payload: &Value) -> UsageInfo {
    let usage = payload.get("usage").unwrap_or(&Value::Null);
    let input = number_at(usage, "input_tokens");
    let output = number_at(usage, "output_tokens");

    UsageInfo {
        input_tokens: input,
        cached_input_tokens: number_at(usage, "cache_read_input_tokens"),
        cache_creation_input_tokens: number_at(usage, "cache_creation_input_tokens"),
        output_tokens: output,
        total_tokens: match (input, output) {
            (Some(input_tokens), Some(output_tokens)) => Some(input_tokens + output_tokens),
            _ => None,
        },
        estimated_cost: None,
        currency: None,
        cost_source: Some("unavailable".to_string()),
    }
}

fn number_at(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
}
