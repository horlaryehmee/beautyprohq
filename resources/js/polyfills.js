if (!String.prototype.replaceAll) {
    Object.defineProperty(String.prototype, 'replaceAll', {
        configurable: true,
        writable: true,
        value(search, replacement) {
            const value = String(this);

            if (search instanceof RegExp) {
                if (!search.global) {
                    throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument');
                }

                return value.replace(search, replacement);
            }

            return value.split(String(search)).join(String(replacement));
        },
    });
}

if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
        configurable: true,
        writable: true,
        value(index) {
            const length = this.length;
            const normalized = Math.trunc(index) || 0;
            const position = normalized >= 0 ? normalized : length + normalized;

            return position < 0 || position >= length ? undefined : this[position];
        },
    });
}
