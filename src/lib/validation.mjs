export function validateBaseUrl(value) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return {
      valid: false,
      message: 'Base URL 不能为空'
    };
  }

  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    return {
      valid: false,
      message: 'Base URL 需要以 http:// 或 https:// 开头'
    };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      message: 'Base URL 格式不正确'
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      message: 'Base URL 只支持 http:// 或 https://'
    };
  }

  return {
    valid: true,
    normalized: `${parsed.origin}${trimTrailingSlash(parsed.pathname)}${parsed.search}`
  };
}

export function sanitizeDecimalInput(value, maxDecimalPlaces = 5) {
  const raw = String(value ?? '');
  let cleaned = '';
  let hasDot = false;
  let decimalPlaces = 0;

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      if (hasDot) {
        if (decimalPlaces >= maxDecimalPlaces) continue;
        decimalPlaces += 1;
      }
      cleaned += char;
      continue;
    }

    if (char === '.' && !hasDot) {
      cleaned += char;
      hasDot = true;
    }
  }

  return cleaned;
}

function trimTrailingSlash(pathname) {
  if (!pathname || pathname === '/') return '';
  return pathname.replace(/\/+$/, '');
}
