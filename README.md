# vue-hooked-async-events
[![npm](https://img.shields.io/npm/v/vue-hooked-async-events.svg)](vue-hooked-async-events) ![npm](https://img.shields.io/npm/dt/vue-hooked-async-events.svg)

Easier and more useful Vue event bus management with zero dependencies.
## Installation
```javascript
import Vue from 'vue';
import HookedAsyncEvents from 'vue-hooked-async-events';

Vue.use(HookedAsyncEvents);
```

## Events management

### Standard event bus approach & its issues
To create a global event system the standard is to create an event bus:
```javascript
    Vue.prototype.$eventBus = new Vue();
    // or
    export const EventBus = new Vue();
```

#### Issues
- Major issue with using standard event bus is that it creates a new `Vue` instance with lots of unused methods and properties. 
- It is managed by Vue, thereby creating a lot of overhead.

 `vue-hooked-async-events` on the other hand creates a simple object containing awesome events-related functionalities. 

- You can't just write `this.$eventBus.off()` in order to unsubscribe only this component from all events it was subscribed to, that will instead remove all events from everywhere.
- You remove events manually. You have to make sure you manually remove events in the component you listen from:
```javascript
    beforeDestroy() {
        this.$eventBus.off('event-one', this.methodOne);
        this.$eventBus.off('event-two', this.methodTwo);
        this.$eventBus.off('event-three', this.methodThree);
        this.$eventBus.off('event-four', this.methodFour);
        // ... and so on
    }
```

This package is responsible for automatic event bus unsubscription when component is being destroyed.
Instead of above you should write:
```javascript
```
**Yes. Correct. Nothing.** Plugin will handle all of this by itself, unsubscribing current component inside of its `beforeDestroy` hook.
 
## Methods
There are several methods used to manage events.

### Listening to events:
Listening to event or events:
```javascript
created() {
  this.$onEvent('some-event', this.eventCallback);
  // listen once and remove
  this.$onEvent('some-event', this.eventCallback1, { once: true });
  this.$onceEvent('some-event', this.eventCallback2, { once: true });
  // stop invoking other callbacks once this listener is executed
  this.$onEvent('some-event', this.eventCallback3, { stop: true });
  // automatically stop listening after 5000 milliseconds
  this.$onEvent('some-event', this.eventCallback3, { expire: 5000 });
  // multiple events being listen to by one callback
  this.$onEvent(['second-event', 'third-event'], this.commonCallback);
  // fire multiple callbacks (even for multiple events)
  this.$onEvent('some-event', [this.eventCallback1, this.eventCallback2]);
  this.$onEvent(['second-event', 'third-event'], [this.eventCallback1, this.eventCallback2]);
},

methods: {
  eventCallback (payload, metadata) {
    // payload is the data being passed by the event or from previous callback listener in the chain of callbacks
    // for the event. EG: if this callback returns then the response is the next callback's payload.

    // metadata is information about the event and the listener itself eg:
    metadata == {
      eventName: "opened-exlist-item", eventOptions: {/*opts passed to event*/},
      callbackOptions: {/*opts passed to listener*/},
      eventOrigin: VueComponent /*vue compo that emitted the event*/, listenersTally: 1
    };
  
    return /*whatever response you want to the event if it's a hook; see below*/
    // you can also return { payload, directives: {}}
  }
  eventCallback2 (payload, metadata) {
    // you can also change how the event will behave by modifying the eventOptions or callbackOptions
    // eg: stop invoking any subsequent callbacks on the event
    metadata.callbackOptions.stop = true; // or 
    metadata.eventOptions.stop = true;
  }
}
```

### Emitting events:
Emitting events is simple, but this package takes it to another level of usability with async events.
```javascript
methods: {
  async fireEvents() {
    this.$emitEvent('some-event', { test: 'one' });
    // fire event callbacks in reverse order
    this.$emitEvent('some-event2', { test: 'one' }, { reverse: true });
    // why? EG: Consider the following components hierachy c=>c=>c=>c
    // it will register events from the parent down to the last grandchild, 
    // so when run, the event listeners' callbacks are run in the same order.
    // To run in the other order from the last grandchild to the parent 
    // emit the event with a reverse option. You will soon get why more below

    // stop on the first listener callback
    this.$emitEvent('some-event3', { test: 'one' }, { stop: true });
    // linger for 5000ms for new listeners on the event. 
    this.$emitEvent('some-event3', { test: 'one' }, { linger: 5000 });
    // Why? burst race conditions, use with care
    
    // get info from the last listener (this is where you MAY need to use reverse invocation order)
    const endResult = await this.$emitEvent('some-event', { test: 'one' }, { isHook: true, reverse: true });
  }     
}
```

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
If you use some plugins, which have some conflicting function names (or you just don't like default ones), you can rename all of them according to your preferences.
NOTE: use this feature at your own risk as it will warn you only for Vue basic properties:
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
        fallSilent: '$noMore'
    });

    // later in component...
    created() {
        this.$hear('some-event', this.callbackMethod);
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
Emmanuel Mahuni, changed a lot of things in the package to make even more awesome.

#### Attribution
This package was adopted from https://github.com/p1pchenk0/vue-handy-subscriptions 's idea, just had to make it another package as it departs a lot from the original.

