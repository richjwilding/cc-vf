        export function roundCurrency(number){
            if(number === 0){
                return "$0"
            }
            const suffixes = ["", "K", "M","B"];
            const suffixIndex = Math.floor(Math.log10(Math.abs(number)) / 3);

            const scaledNumber = number / Math.pow(10, suffixIndex * 3);
            const formattedNumber = scaledNumber.toFixed(2);

            return "$" + formattedNumber.replace(/\.00$/, '') + suffixes[suffixIndex];
        }