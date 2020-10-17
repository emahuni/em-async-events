# vue-hooked-async-events
[![npm](https://img.shields.io/npm/v/vue-hooked-async-events.svg)](vue-hooked-async-events) ![npm](https://img.shields.io/npm/dt/vue-hooked-async-events.svg)

Easier and more useful Vue event bus with zero dependencies. Features include expirable, lingering and catch-up async events and listeners, and a customizable atomic API.

## Features
- **stoppable events and listeners**; stop an event from firing on other callbacks when it hits a specific callback or on the first callback
- **automated event management:**
  - auto-removal of listeners on destruction.
  - expirable listeners that listen for a specified time before they are removed.
- **async/hookable events** that get responses from listeners.
- **lingering events;** these are events that are fired and used by current listeners, but wait for newer listeners until a specified time before being discarded.
- **multiple callbacks and events registrations:** 
    - handle multiple events with one callback.
    - invoke/fire multiple callbacks from multiple events.
    - register these using atomic statements.
- doesn't pollute your Vue prototype

## Installation
```javascript
import Vue from 'vue';
import HookedAsyncEvents from 'vue-hooked-async-events';

Vue.use(HookedAsyncEvents);
```

## Events management
This package aims to address the above features and avoid some thorny issues that other event buses have:
### Standard event bus approach & its issues
To create a global event system the standard is to create an event bus:
```javascript
    Vue.prototype.$eventBus = new Vue();
    // or
    export const EventBus = new Vue();
```

#### Issues
- Major issue with using standard event bus is that it creates a new `Vue` instance with lots of unused methods and properties. 
- It is managed by Vue since it'll be a complete Vue component, thereby creating a lot of overhead.
`vue-hooked-async-events` on the other hand creates a simple object containing awesome events-related functionalities that doesn't add any overhead or watchers/observers of any kind. 

- You can't quickly remove events by just writing `this.$eventBus.off()` to unsubscribe only `this` component's events. Even if it is typed it will remove all events it was subscribed to that have a common event type amongst components eg: `this.$eventBus.off('some-event')`.
- You have to make sure you manually remove events in the component you listen from eg:
```javascript
    beforeDestroy() {
        this.$eventBus.off('event-one', this.methodOne);
        this.$eventBus.off('event-two', this.methodTwo);
        this.$eventBus.off('event-three', this.methodThree);
        this.$eventBus.off('event-four', this.methodFour);
        // ... and so on
    }
```

So with `vue-hooked-async-events` you instead write:
```javascript
```
**Yes. Correct. Nothing.** Plugin will handle all of this by itself, unsubscribing current component listeners in its `beforeDestroy` hook.
 
## Methods
There are several methods used to manage events with super duper conviniencies like async events/listeners/callbacks.

### Listening to events:
Listening to event or events:
- most options can be mixed to get the desired behaviour
- callback arguments: `payload` and listener `options` (used to add the listener)
```javascript
created() {
  this.$onEvent('some-event', this.eventCallback);
  // send extra info to callback from where listener is invoked... 
  // callback should extract extra info. see corresponding callback below
  // instead of doing this.$onEvent('some-event', (pl)=>this.eventCallback(pl, {blah: 'bloh'}));
  this.$onEvent('some-event', this.eventCallbackExtra, { extra: {blah: 'bloh'} });

  // listen once and remove
  this.$onEvent('some-event', this.eventCallback1, { once: true });
  this.$onceEvent('some-event', this.eventCallback2);

  // only continue after event has been emitted 
  // - callback doesn't have to be async or even defined, if so then it also awaits callback resolution
  let result = await this.$onceEvent('some-event', this.eventCallback3, { isAsync: true });
  result = await this.$onceEvent('some-event', { isAsync: true });
  // or you can do something each time event is handled elsewhere, but this is more like the callback option
  this.$onEvent('some-event', this.eventCallback3, { isAsync: true }).then(/*...*/);

  // automatically stop listening after 5000 milliseconds
  this.$onEvent('some-event', this.eventCallback3, { expire: 5000 });
  // automatically run expiry callback function before unlistening after 10000 milliseconds 
  this.$onEvent('some-event', this.eventCallback3, { expire: 10000, expiryCallback: async ()=>{
    // do something that's even async it will wait for promise
  }});

  // catch up to an event that happened not more than 100 milliseconds ago (bust race conditions)
  // - (max 500 - change globalLinger option; see below)
  // - it doesn't have to be a lingered event
  this.$onEvent('some-event', this.eventCallback3, { catchUp: 100 });

  // atomic listener API:
  // multiple events being listened to by one callback
  this.$onEvent(['second-event', 'third-event'], this.commonCallback);
  // fire multiple callbacks (even for multiple events)
  this.$onEvent('some-event', [this.eventCallback1, this.eventCallback2]);
  // here each callback will correspond to its respective event
  this.$onEvent(['second-event', 'third-event'], [this.eventCallback1, this.eventCallback2]);
},

methods: {
  eventCallback (payload, metadata) {
    // payload is the data being passed by the event or from previous callback listener in the chain of callbacks
    // for the event. EG: if this callback returns then the response is the next callback's payload.

    // metadata is information about the event and the listener itself eg:
    metadata == {
      extra: 'extra payload (not event related) from listener adding line',
      eventName: "some-event", 
      eventOptions: {/*opts passed to event*/},
      listenerOptions: {/*opts passed to listener*/},
      eventOrigin: VueComponent /*vue compo that emitted the event*/,
      listenersTally: 6 // number of listeners for this event
    };
  },


  async eventCallbackExtra (payload, { extra }) {
    // extra contains extra payload from where listener was defined if specified, see above. Allows for a more cleaner API
    // - passed to every event for the listener
  },


  async eventCallback1 (payload, metadata) {
    // if you are going to return anything to event make sure you use 'isAsync' option and callback is async 
    return /*whatever response you want to return to the event only if it's async; see below*/
  },

  async eventCallback2 (payload, metadata) {
    // you can get reponses from all callback this way in each callback
    // ... do whatever this callback does
    let newPayload = { blah: 'any new payload of any type for this callback to pass back'};
    return this.$chainCallbackPayload(payload, newPayload, metadata);
    // passed to the next callback as payload, and finally to the emitted event,
    // which can find all results in payload.$results$[]
    // do the above in every callback that will be part of this chain
  },

  eventCallback3 (payload, metadata) {
    // you can also change how the event will behave by modifying the listenerOptions
    // - not all options are modifiable
    // eg: stop invoking any subsequent callbacks on the event
    metadata.listenerOptions.stopHere = true;
  }
}
```

### Emitting events:
Emitting events is simple, but this package takes it to another level of usability with async events, which are promises returned by eventEmiters for finer flow control on events as they happen and how they are listened and responded to. 
- most options can be mixed to get the desired behaviour
```javascript
methods: {
  async fireEvents() {
    // send payload/data to listeners of 'some-event'
    this.$emitEvent('some-event', { test: 'one' });

    // fire event callbacks of a specific range (default is 'first-parent')
    this.$emitEvent('some-event2', { test: 'one' }, { range: 'ancestors' });
    // why? EG: Consider the following components hierachy all listening to the same event:
    //        grandparent=>parent=>child=>grandchild=>greatGrandchild
    // if event was fired at grandchild then all listeners from parent to grandparent'll handle event.
    // stop on the first listener callback (guaranteeing event is handled only once, by first listener)
    this.$emitEvent('some-event2', { test: 'one' }, { range: 'first-parent' });
    // linger for 5000ms for new listeners on the event. Can't be async/expect any return values
    this.$emitEvent('some-event3', { test: 'one' }, { linger: 5000 });
    // Why? bust race conditions, use with care
    
    // get info from the last listener (this is where you MAY need to use reverse invocation order)
    const endResult = await this.$emitEvent('some-event', { test: 'one' }, { isAsync: true, range: 'first-child' });
    // isAsync option is required for events that expect a response

    // atomic emission API: unlike listeners only single payload is allowed here
    // emit multiple events, 
    this.$emitEvent(['second-event', 'third-event'], {test: 'payload'});
    // if async then the result will be array of promises respective of each event, we may use it this way eg: 
    await new Promise.all(this.$emitEvent(['second-event', 'third-event'], {test: 'payload'}, {isAsync: true}));
  }     
}
```

Event range options offer precise control over which listeners are invoked. You target them using tokens based on the hierarchic position/level of component that emits the event (event origin) (see above example).

 
Options are separated by a hyphen and constructed from the following tokens (eg: `parent-descendents` will invoke the parent and any descendents): 
- `self`: will only invoke listeners in event origin (component that fired the event). Every other token will begin from origin as well.
- `child` or `children`: will invoke listeners that are below event, whether they are direct descendents of event origin or not. Note, this won't go all the way down, just the next level only.
- `descendent` or `descendents`: will invoke listeners that are below origin, whether they are direct descendents of event origin or not. Note, this will invoke up to the last-most-bottom listener. 
- `child` or `children`: will invoke listeners that are below event, whether they are direct descendents of event origin or not. Note, this won't go all the way down, just the next level only.
- `descendent` or `descendents`: will invoke listeners that are below origin, whether they are direct descendents of event origin or not. Note, this will invoke up to the last-most-bottom listener. 
- same goes for `ancestors` or `parent`... but in the opposite direction.
- `broadcast` - invokes every listener listening for event regardless of location.



By level we mean the following. Consider there is a listener where there is an 👂🏽:

(todo need to use graphics here and cleanup docs)
  
 compo0👂🏽=>compo1👂🏽=>compo2👂🏽=>compo3=>compo4=>compo5(origin)=>compo6=>compo7👂🏽=>compo8👂🏽=>compo9=>compo10👂🏽
 
 sib0👂🏽=>sib👂🏽=>sib2👂🏽=>sib3=>sib4=>sib5(sibling)=>sib6=>sib7👂🏽=>sib8👂🏽=>sib9

Relative to origin, where event is emitted:
 - compo2 is level -1 and is `parent`(for the first one only) or `parents` (for all components on the same level but in other hierarchies.
- compo1 is level -2 and is `ancestor` (for the first one only)  or `ancestors` (see above explanation), but including all the way up to any listeners before it eg: compo0.
 - compo7 is level 1 and is `child` (for the first one only) or `children` (for all components on the same level but in other hierarchies.
 - compo8 is level 2 and is `descendent` (for the first one only)  or `descendents` (see children explanation), but including all the way down to any listeners after it eg: compo10.
                              

### Remove Event Listeners
Removing event from events object for all listeners (example):
```javascript
    methods: {
        dontWannaListenAnymore() {
            this.$eraseEvent('some-event'); // now no component will listen to this event
            this.$eraseEvent(['second-event', 'third-event']);
        }
    }
```

### Remove Events manually (example):
```javascript
    methods: {
        leaveMeAlone() {
            // nice, but it is also done automatically inside "beforeDestroy" hook
            this.$fallSilent(); 
        }
    }
```
### Remove specific callback for specific event (example): 
```javascript
    methods: {
        leaveMeWithoutSpecificCallback() {
            this.$fallSilent('some-event', this.specificCallback);
        }
    }
```
### Remove array of callbacks for specific event (example):
```javascript
    methods: {
        leaveMeWithoutSpecificCallbacks() {
            this.$fallSilent('some-event', [this.callbackOne, this.callbackTwo]);
        }
    }
```
### Unsubscribe component from specific event or events 
- all component's callbacks for these events will be removed:
```javascript
    methods: {
        notListenToOne() {
            this.$fallSilent('some-event');
        },
        notListenToMany() {
            this.$fallSilent(['some-event', 'another-event']);
        }
    }
```


### Customization
- renaming functions:
    - If you use some plugins, which have some conflicting function names (or you just don't like default ones), you can rename all of them according to your preferences.
NOTE: use this feature at your own risk as it will warn you only for Vue basic properties.
- default callback and event options
```
    "$options", "$parent", "$root", "$children", "$refs", "$vnode", "$slots", "$scopedSlots", "$createElement", "$attrs", "$listeners", "$el"
```
```javascript
    import Vue from 'vue';
    import HookedAsyncEvents from 'vue-hooked-async-events';

    Vue.use(HookedAsyncEvents, {
        onEvent: '$hear',
        onceEvent: '$hearOnce',
        emitEvent: '$fireEvent',
        eraseEvent: '$deleteEvent',
        fallSilent: '$noMore',

        // default options that you don't have to set all the time
        // listenersOptions default = { 
        //  stopHere: false, expire: 0, once: false, isAsync: false, catchUp: false, trace: false
        // }
        listenersOptions: { stopHere: true, /*...*/ },
        // eventsOptions default = { 
        //   range: 'first-parent', linger: 0, lingerForOne: false, isAsync: false, trace: false 
        // }
        eventsOptions: { range: 'ancestors', isAsync: true, /*...*/ },

        // all events linger for a default of 500ms, but only trigger if a listener has catchUp option set (see above)
        // you can change the default globalLinger here to whatever you want. take care
        globalLinger: 3000,

        // debugging options, useful when you want to see what's going on. below are the defaults
        debug: {
            all:                    false, // toggles all debugging, but Vue.config.devtools option, which is usually true at development, turns it to false if it is false.
            addListener:            true, // show add listener debug messages
            invokeListener:         true, // show debug messages when listener is invoked
            emitEvent:              true, // show emit events debug messages
            eraseEvent:             true, // show erase event listeners debug messages
            lingerEvent:            true, // show linger events debug messages
            chainListenerCallbacks: true, // show chainListenerCallbacks debug messages
            removeListener:         true  // show remove listener debug messages
        }
      
    });

    // later in component...
    created() {
        this.$hear('some-event', this.callbackMethod);

        // you can also change options in userland
        this.$asyncEvents.options.debug.all = true; 
    },
    methods: {
        doSmth() {
            this.$fireEvent('some-event');
        },
        unsubscribe() {
            this.$noMore('some-event');
        }
    }
```

## Author
Emmanuel Mahuni, changed a lot of things in the package to make it even more awesome.

#### Attribution
This package was adopted from https://github.com/p1pchenk0/vue-handy-subscriptions 's idea, just had to make it another package as it departs a lot from the original.

