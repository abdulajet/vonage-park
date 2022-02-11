import { neru, Voice, Scheduler, Messages } from 'neru-alpha';

const router = neru.Router();
const session = neru.createSession();
const voice =  new Voice(session);

const contact = JSON.parse(process.env['NERU_CONFIGURATIONS']).contact;
await voice.onInboundCall('onCall', contact).execute();

router.post('/onCall', async (req, res, next) => {
    try {
        const session = neru.createSession();
        const state = session.getState();
        const voiceApi = new Voice(session);

        const conversation = await voiceApi.createConversation();

        await conversation.acceptInboundCall(req.body).execute();
        await state.set('conversationData', {
            id: conversation.id,
            name: conversation.name,
            number: req.body.body.channel.from.number
        });
        await state.set('flowState', 'id');
        await conversation.onDTMF('onDtmf').execute();
        await conversation.sayText({ 
            text: `Welcome to VonagePark,
            enter the car park ID followed by star to continue.`
        }).execute();

        res.status(200);
    } catch (error) {
        next(error);
    }
});

router.post('/onDtmf', async (req, res, next) => {
    try {
        const session = neru.getSessionFromRequest(req)
        const state = session.getState();
        const voice = new Voice(session);

        const digit = req.body.body.digit;
        
        const flowState = await state.get("flowState");
        const conversationData = await state.get("conversationData");
        const conversation = voice.getConversation(conversationData.id, conversationData.name);

        switch (flowState) {
            case 'id':
                if (digit === '*') {
                    const parkingID = await state.get("dtmfDigits");
                    await state.set('flowState', 'hour');
                    await conversation.sayText({ text: `You are parking at ${parkingID}.
                    Press a digit to choose how many hours you want to pay for.`}).execute();
                } else {
                    const currentDigits = await state.get("dtmfDigits");
                    if (currentDigits != null) {
                        await state.set("dtmfDigits", currentDigits+digit);
                    } else {
                        await state.set("dtmfDigits", digit);
                    }
                }
                break;
            case 'hour':
                await state.set("hours", digit);
                await state.set('flowState', 'pay');
                await conversation.sayText({text: `You are parking for ${digit} hours. 
                Enter your card number followed by a star to pay.`}).execute();
                break;
            case 'pay':
                const messaging = new Messages(session);
                const scheduler = new Scheduler(session);
                if (digit === '*') {
                    const hours = await state.get("hours");
                    const parkingID = await state.get("dtmfDigits");
                    const conversationData = await state.get("conversationData");
        
                    const conversation = voice.getConversation(conversationData.id, conversationData.name);
                    await chargeCard();
                    await conversation.sayText({text: `Your card has been charged for ${hours} hours. 
                    You will receive a text confirmation and a reminder when your parking is about to expire`}).execute();
        
                    const to = { type: "sms", number: conversationData.number };
                    const from = { type: "sms", number: contact.number }; 
        
                    await messaging.sendText(
                        from,
                        to,
                        `You are parking at ${parkingID} and have paid for ${hours} hours.`
                    ).execute();
        
                    const endTime = new Date(new Date().setHours(new Date().getHours() + parseInt(hours)));
                    const testTime = new Date(new Date().setSeconds(new Date().getSeconds() + 10));
        
                    scheduler.startAt({
                        // startAt: new Date(endTime.getTime() - (1000 * 5)).toISOString(),
                        startAt: testTime.toISOString(),
                        callback: 'parkingReminder',
                        payload: {
                            text: 'hello world!',
                        }
                    }).execute();

                    await state.set('flowState', '');

                } else {
                    const currentDigits = await state.get("cardDigits");
                    if (currentDigits != null) {
                        await state.set("cardDigits", currentDigits+digit);
                    } else {
                        await state.set("cardDigits", digit);
                    }
                }
                break;
        }
        res.status(200);
    } catch (error) {
        next(error);
    }
});

async function chargeCard() {
	return new Promise((resolve) => {
        setTimeout(resolve, 3 * 1000);
      });
}

router.post('/parkingReminder', async (req, res, next) => {
    try {
        const session = neru.getSessionFromRequest(req)
        const state = session.getState();
        const messaging = new Messages(session);

        const parkingID = await state.get("dtmfDigits");
        const conversationData = await state.get("conversationData");

        const to = { type: "sms", number: conversationData.number };
        const from = { type: "sms", number: contact.number }; 

        await messaging.sendText(
            from,
            to,
            `Your parking at ${parkingID} is about to run out.`
        ).execute();

        res.status(200);
    } catch (error) {
        next(error);
    }
});

export { router };