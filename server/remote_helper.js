async function clickButton(page, text, selector = '[role="button"]', attempts = 10){
    const elementHandle = await page.evaluateHandle((text, selector) => {
        const elements = Array.from(document.querySelectorAll(selector));
        console.log(elements.map(d=>d.textContent.trim()).join("\n"))
        return elements.find(element => element.textContent.trim() === text) || null;
    }, text, selector);
    
    if( elementHandle && elementHandle.click){
        const buttonBox = await elementHandle.boundingBox();
        await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
        await elementHandle.click( )
    }else{
        if( attempts > 0){
            await new Promise(r => setTimeout(r, 500));
            return await clickButton(page, text, selector. attempts - 1)
        }
    }
    return elementHandle

}
module.exports = {
    clickButton
}
