'use strict';

const isDeepEqual = require('deep-equal');
const { Thing } = require('abstract-things');

const IDENTITY_MAPPER = v => v;

class SubDeviceManagement {
	constructor(device, parent) {
		this._device = device;
		this.parent = parent;
	}

	get token() {
		return null;
	}

	get model() {
		return this._device.miioModel;
	}

	info() {
		const device = this._device;
		return Promise.resolve({
			id: device.id,
			model: device.model
		});
	}
}

module.exports = Thing.type(Parent => class SubDevice extends Parent {
	static get types() {
		return [ 'miio:subdevice' ];
	}

	constructor(parent, info) {
		super();

		this.miioModel = info.model;
		this.id = info.id;

		// Store the internal id by removing the `miio:` prefix
		this.internalId = info.id.substring(5);

		this._properties = {};
		this._propertiesToMonitor = [];
		this._propertyDefinitions = {};

		this._parent = parent;

		this.management = new SubDeviceManagement(this, parent);
	}

	hasCapability(name) {
		return this.capabilities.indexOf(name) >= 0;
	}

	initCallback() {
		return super.initCallback()
			.then(() => {
				if(this._propertiesToMonitor.length === 0) return;

				return this._parent.call('get_device_prop_exp', [ [ 'lumi.' + this.internalId, ...this._propertiesToMonitor ]])
					.then(result => {
						for(let i=0; i<result[0].length; i++) {
							let name = this._propertiesToMonitor[i];
							const def = this._propertyDefinitions[name];
							let value = result[0][i];

							name = def.name || name;
							value = def.mapper(value);

							this.setProperty(name, value);
						}
					});
			})
			.then(() => this);
	}

	_report(data) {
		this._propertiesToMonitor.forEach(key => {
			const def = this._propertyDefinitions[key];
			let name = key;
			let value = data[key];
			if(typeof value === 'undefined') return;

			if(def) {
				name = def.name || name;
				value = def.mapper(value);
			}

			this.setProperty(name, value);
		});
	}

	get properties() {
		return Object.assign({}, this._properties);
	}

	property(key) {
		return this._properties[key];
	}

	/**
	 * Define a property and how the value should be mapped. All defined
	 * properties are monitored if #monitor() is called.
	 */
	defineProperty(name, def) {
		if(! def || typeof def.poll === 'undefined' || def.poll) {
			this._propertiesToMonitor.push(name);
		}

		if(typeof def === 'function') {
			def = {
				mapper: def
			};
		} else if(typeof def === 'undefined') {
			def = {
				mapper: IDENTITY_MAPPER
			};
		}

		if(! def.mapper) {
			def.mapper = IDENTITY_MAPPER;
		}

		this._propertyDefinitions[name] = def;
	}

	setProperty(key, value) {
		const oldValue = this._properties[key];

		if(! isDeepEqual(oldValue, value)) {
			this._properties[key] = value;
			this.debug('Property', key, 'changed from', oldValue, 'to', value);

			this.propertyUpdated(key, value, oldValue);
		}
	}

	propertyUpdated(key, value, oldValue) {
	}

	getProperties(props) {
		const result = {};
		props.forEach(key => {
			result[key] = this._properties[key];
		});
		return result;
	}

	/**
	 * Stub for loadProperties to match full device.
	 */
	loadProperties(props) {
		return Promise.resolve(this.getProperties(props));
	}

	/**
	 * Call a method for this sub device.
	 */
	call(method, args, options) {
		if(! options) {
			options = {};
		}

		options.sid = this.internalId;
		return this._parent.call(method, args, options);
	}
});
