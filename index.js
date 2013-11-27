var once = require('once');
var eos = require('end-of-stream');
var fs = require('fs'); // we only need fs to get the ReadStream and WriteStream prototypes

var noop = function() {};

var isFn = function(fn) {
	return typeof fn === 'function';
};

var isFS = function(stream) {
	return (stream instanceof fs.ReadStream || stream instanceof fs.WriteStream) && isFn(stream.close);
};

var isRequest = function(stream) {
	return stream.setHeader && typeof isFn(stream.abort);
};

var destroyer = function(stream, reading, writing, callback) {
	callback = once(callback);

	var closed = false;
	stream.on('close', function() {
		closed = true;
	});

	eos(stream, {readable:reading, writable:writing}, callback);

	var destroyed = false;
	return function(err) {
		if (closed) return;
		if (destroyed) return;
		destroyed = true;

		if (isFS(stream)) return stream.close(); // use close for fs streams to avoid fd leaks
		if (isRequest(stream)) return stream.abort(); // request.destroy just do .end - .abort is what we want

		if (isFn(stream.destroy)) return stream.destroy();
		if (isFn(stream.close)) return stream.close();

		callback(err || new Error('stream was destroyed'));
	};
};

var call = function(fn) {
	fn();
};

var pipe = function(from, to) {
	return from.pipe(to);
};

var pump = function() {
	var streams = Array.prototype.slice.call(arguments);
	var callback = isFn(streams[streams.length-1] || noop) && streams.pop() || noop;

	if (Array.isArray(streams[0])) streams = streams[0];
	if (streams.length < 2) throw new Error('pump requires two streams per minimum');

	var error;
	var destroys = streams.map(function(stream, i) {
		var reading = i < streams.length-1;
		var writing = i > 0;
		return destroyer(stream, reading, writing, function(err) {
			if (!error) error = err;
			if (err) destroys.forEach(call);
			if (reading) return;
			destroys.forEach(call);
			callback(error);
		});
	});

	return streams.reduce(pipe);
};

module.exports = pump;