var types = ['scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot', 'text'];
var nextTypes = {
    scene: 'action',
    action: 'action',
    character: 'dialogue',
    dialogue: 'character',
    parenthetical: 'dialogue',
    transition: 'scene',
    shot: 'action',
    text: 'text'
};

var StopPropagationMixin = {
	stopProp: function(event) {
		event.nativeEvent.stopImmediatePropagation();
	},
};
function cursorPos(element) {
    var caretOffset = 0;
    var doc = element.ownerDocument || element.document;
    var win = doc.defaultView || doc.parentWindow;
    var sel;
    if (typeof win.getSelection != "undefined") {
        sel = win.getSelection();
        if (sel.rangeCount > 0) {
            var range = win.getSelection().getRangeAt(0);
            var preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(element);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            caretOffset = preCaretRange.toString().length;
        }
    } else if ( (sel = doc.selection) && sel.type != "Control") {
        var textRange = sel.createRange();
        var preCaretTextRange = doc.body.createTextRange();
        preCaretTextRange.moveToElementText(element);
        preCaretTextRange.setEndPoint("EndToEnd", textRange);
        caretOffset = preCaretTextRange.text.length;
    }
    return caretOffset;
};

function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection != "undefined"
            && typeof document.createRange != "undefined") {
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } else if (typeof document.body.createTextRange != "undefined") {
        var textRange = document.body.createTextRange();
        textRange.moveToElementText(el);
        textRange.collapse(false);
        textRange.select();
    }
}

function S4() {
   return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
}
function guid() {
   return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}


var Script = React.createClass({
	mixins: [ReactFireMixin, ReactRouter.State],
	getInitialState: function() {
		highlight = '';
		var scriptId = this.getParams().scriptId;
		// console.log(this.getParams());return;
		// CLEANUP OLD DATA
		var fb = new Firebase("https://screenwrite.firebaseio.com/"+scriptId);
		fb.once('value', function(snapshot){
			if (!snapshot.val()) {
				fb.set({});
				var newLine = fb.child('lines').push({ type: 'scene' });
				fb.update({ firstLine: newLine.key() });
				return;
			}
			if (snapshot.val().firstLine) return;
			var previous, previousIndex;
			fb.update({firstLine: '0'});
			_.each(snapshot.val().lines, function(line, index) {
				if (previous) {
					fb.child('lines/'+previousIndex+'/next').set(index);
				}
				previous = line;
				previousIndex = index;
			});
		});

		return {
			scriptId: scriptId,
			script: {},
			lines: [],
			editing: {}
		};
	},
	componentWillMount: function() {
		this.bindAsObject(new Firebase("https://screenwrite.firebaseio.com/"+this.state.scriptId), "script");
	},
	editing: function(line) {
		this.setState({editing:line});
	},
	handleKey: function(event, line, index, prevIndex, prevPrevIndex) {
		switch (event.keyCode) {
            case 38: // up
                if (prevIndex) {
	                if (event.metaKey || event.ctrlKey) {
	                	// [a, b, C, d] => [a, C, b, d]
	                	// A points to C
	                	if (prevPrevIndex)
		                	this.firebaseRefs.script.child('lines/'+prevPrevIndex).update({next: index});
		                else
		                	this.firebaseRefs.script.update({firstLine:index});
                    	// C points to B
                    	var newNext = line.next;
                    	this.firebaseRefs.script.child('lines/'+index).update({next: prevIndex });
                    	// B points to D
                    	if (line.next)
                    		this.firebaseRefs.script.child('lines/'+prevIndex).update({next: newNext });
                    	else
	                    	this.firebaseRefs.script.child('lines/'+prevIndex+'/next').remove();
                        this.refs['line'+index].focus(true);
	                    event.preventDefault();
	                } else if (!cursorPos(event.target)) {
	                    this.refs['line'+prevIndex].focus(true);
	                    event.preventDefault();
	                }
                }
                break;
            case 40: // down
            	if (line.next) {
	                if (event.metaKey || event.ctrlKey) {
			            // [a, b, c, d] => [a, c, b, d]

	                	// A points to C
	                	if (prevIndex)
		                	this.firebaseRefs.script.child('lines/'+prevIndex).update({next: line.next});
		                else
		                	this.firebaseRefs.script.update({firstLine:line.next});
	                	var newNext = this.state.script.lines[line.next].next;
	                	// C points to B
	                	this.firebaseRefs.script.child('lines/'+line.next).update({next: index});
	                	// B points to D
	                	if (newNext)
		                	this.firebaseRefs.script.child('lines/'+index).update({ next: newNext });
		                else
		                	this.firebaseRefs.script.child('lines/'+index+'/next').remove();
	                    this.refs['line'+index].focus();
	                    event.preventDefault();
	                } else if (cursorPos(event.target) >= event.target.textContent.length ) {
	                	this.refs['line'+line.next].focus();
	                    event.preventDefault();
	                }
            	}
                break;
            case 8: // backspace
                if (!line.text && prevIndex) {
                	// update previous line
                	if (line.next)
	                	this.firebaseRefs.script.child('lines/'+prevIndex).update({next:line.next});
	                else
	                	this.firebaseRefs.script.child('lines/'+prevIndex+'/next').remove();

	                // remove line
                    this.firebaseRefs.script.child('lines/'+index).remove();
                    this.refs['line'+prevIndex].focus(true);
                    event.preventDefault();
                }
                break;
            case 13: // enter
                if (line.text) {
                	// create new line pointing to current line's `next`
                	var newItem = { type: nextTypes[line.type] };
                	if (line.next) newItem.next = line.next;
                    newRef = this.firebaseRefs.script.child('lines').push(newItem);
                    // point current line to the new line
                    this.firebaseRefs.script.child('lines/'+index+'/next').set(newRef.key());
                    setTimeout((function(){
                    	this.refs['line'+newRef.key()].focus();
                    }).bind(this));
                }
        }
	},
	render: function() {


		var indexes = {};
		var lines = [];
		var previous, prevPrevious;
		var next = (function(line, index){
			lines.push(
				<Line line={line} key={index} index={index} ref={'line'+index}
					previous={previous} prevPrevious={prevPrevious}
					onFocus={this.editing.bind(this, index)}
					onKeyDown={this.handleKey} />
			);
			prevPrevious = previous;
			previous = index;
			if (line.next) next(this.state.script.lines[line.next], line.next);
		}).bind(this);

		if (this.state.script && this.state.script.lines && this.state.script.firstLine) {
			next(this.state.script.lines[this.state.script.firstLine], this.state.script.firstLine);
		} else {
			lines = <h1 className="text-center">Loading Script...</h1>
		}
		return (
			<div>
				<Nav script={this.state.script} editingIndex={this.state.editing} />
				<ul className="script">{lines}</ul>
			</div>
		);
	}
});

var highlight = '';

var Line = React.createClass({
	mixins: [ReactFireMixin, StopPropagationMixin, ReactRouter.State],
	getInitialState: function() {
		return {
			comments: this.props.line.comments,
			commenting: false,
			scriptId: this.getParams().scriptId
		};
	},
	componentWillMount: function() {
		this.bindAsObject(new Firebase("https://screenwrite.firebaseio.com/"+this.state.scriptId+"/lines/" + this.props.index), "line");
	},
	handleChange: function(event) {
		this.firebaseRefs.line.update({'text':event.target.value});
		this.setState({ line: { text: event.target.value } });
	},
	handleComment: function(event) {
		this.firebaseRefs.line.update({'comment':event.target.value});
		this.setState({ line: { text: event.target.value } });
	},
	nextType: function(){
        var index = types.indexOf(this.props.line.type) + 1;
        index = (index < types.length) ? index : 0;
        this.setType(types[index]);
    },
    prevType: function() {
        var index = types.indexOf(this.props.line.type) - 1;
        index = (index >= 0) ? index : types.length - 1;
        this.setType(types[index]);
    },
	setType: function(type) {
		this.firebaseRefs.line.update({type:type});
	},
	handleKey: function(event) {
		switch (event.keyCode) {
            case 13: // enter
	            event.preventDefault();
                if (this.props.line.text) {
                    break;
                }
            case 9: // tab
                event.preventDefault();
                if (event.shiftKey) {
                    this.prevType();
                } else {
                    this.nextType();
                }
        }

		this.props.onKeyDown(event, this.props.line, this.props.index, this.props.previous, this.props.prevPrevious);
	},
	comment: function(event) {
		event.stopPropagation();
		this.setState({ commenting: !this.state.commenting }, function(){
			if (this.state.commenting) {
				var that = this;
				document.addEventListener('click', function listener(){
					that.setState({ commenting: false });
					document.removeEventListener('click', listener);
				});
				this.refs.commentBox.getDOMNode().focus();
			}
		});
	},
	focus: function(atEnd) {
		if (atEnd)
			placeCaretAtEnd(this.refs.text.getDOMNode());
		else
			this.refs.text.getDOMNode().focus();
	},
	render: function() {
		return (
			<li className={'line '+this.props.line.type+' '+(highlight && this.props.line.text && highlight.toUpperCase()==this.props.line.text.toUpperCase() && 'highlight')}>
				<ContentEditable
					ref="text"
					html={this.props.line.text}
					onChange={this.handleChange}
					onKeyDown={this.handleKey}
					onFocus={this.props.onFocus}
					className="line-text" />
				<a onClick={this.comment} className="comment-add">
					<i className="glyphicon glyphicon-comment"></i>
				</a>

				{this.state.commenting && <ContentEditable 
					ref="commentBox"
					onChange={this.handleComment}
					onClick={this.stopProp}
					className="comment-box"
					html={this.props.line.comment} />}
			</li>
		);
	}
});

var ContentEditable = React.createClass({
    render: function(){
        return <div 
        	ref="input"
            onInput={this.emitChange} 
            onBlur={this.emitChange}
            onKeyDown={this.props.onKeyDown}
            onClick={this.props.onClick}
            className={this.props.className}
			onFocus={this.props.onFocus}
            contentEditable
            dangerouslySetInnerHTML={{__html: this.props.html}}></div>;
    },
    shouldComponentUpdate: function(nextProps){
        return nextProps.html !== this.getDOMNode().innerHTML;
    },
    emitChange: function(){
        var html = this.getDOMNode().innerHTML;
        if (this.props.onChange && html !== this.lastHtml) {

            this.props.onChange({
                target: {
                    value: html
                }
            });
        }
        this.lastHtml = html;
    }
});

var Nav = React.createClass({
	mixins: [ReactFireMixin, StopPropagationMixin, ReactRouter.State],
	getInitialState: function() {
		return {
			open: null,
			script: {},
			scriptId: this.getParams().scriptId,
			characters: [],
			highlight: ''
		};
	},
	componentWillMount: function() {
		this.bindAsObject(new Firebase("https://screenwrite.firebaseio.com/"+this.state.scriptId), "script");
	},
	toggle: function(dropdown, event) {
		var that = this;
		if (this.state.open != dropdown) {
			setTimeout((function(){
				document.addEventListener('click', function listener(){
					that.setState({ open: false });
					document.removeEventListener('click', listener);
				});
				this.setState({ open: dropdown });
			}).bind(this));
		}
	},
	setType: function(type) {
		if (!this.props.editingIndex) return;
		this.firebaseRefs.script.child('lines/'+this.props.editingIndex+'/type').set(type);
	},
	print: function() {
		window.print();
	},
	highlight: function(event) {
		highlight = event.target.value;
		this.setState({highlight: event.target.value});
	},
	handleChange: function(input, event) {
		this.firebaseRefs.script.child(input).set(event.target.value);
	},
	newScript: function(){
		window.location.hash = '#/' + guid();
		window.location.reload(); // force firebase to reload
	},
	render: function() {
		if (!this.state.script) return <div />;
		var editing = this.state.script.lines && this.state.script.lines[this.props.editingIndex] || {};
		if (this.state.open=='print') {
			var characters = [];
			_.each(_.uniq(_.map(_.pluck(_.where(this.state.script.lines, {type:'character'}), 'text'), function(character){
				return character && character.toUpperCase();
			})), function(character){
				if (character)
					characters.push(<option key={character}>{character}</option>)
			});
		}
		return (
			<div>
				<div className="navbar navbar-inverse navbar-fixed-top hidden-print" role="navigation">
					<div className="container">
						<ul className="nav navbar-nav btn-block row">
							<li className="col-sm-6 col-xs-12 navbar-btn dropdown">
								<div className="input-group">
									<input type="text" className="form-control text-center" value={this.state.script.title} onChange={this.handleChange.bind(this,'title')} placeholder="Script Title" />
									<span className="input-group-btn">
										<a className={'btn btn-default ' + (this.state.dropdowns=='print'&&'active')} onClick={this.toggle.bind(this,'print')} title="Print Options">
											<i className="glyphicon glyphicon-print"></i>
										</a>
										<a className="btn btn-default" onClick={this.newScript} title="New Script">
											<i className="glyphicon glyphicon-plus"></i>
										</a>
									</span>
								</div>
								{this.state.open == 'print' && <div className="popover bottom" style={ { display: 'block' } } onClick={this.stopProp}>
									<div className="arrow"></div>
									<h3 className="popover-title btn btn-block" onClick={this.print}>Print</h3>
									<div className="popover-content">
										<div className="form-group">
											<textarea placeholder="Author(s)" value={this.state.script.authors} onChange={this.handleChange.bind(this,'authors')} className="form-control"></textarea>
										</div>
										<div className="form-group">
											<textarea placeholder="Address (left side)" value={this.state.script.leftAddress} onChange={this.handleChange.bind(this,'leftAddress')} className="form-control"></textarea>
										</div>
										<div className="form-group">
											<textarea placeholder="Address (right side)" value={this.state.script.rightAddress} onChange={this.handleChange.bind(this,'rightAddress')} className="form-control"></textarea>
										</div>
										<div className="form-group">
											<select className="form-control" onChange={this.highlight} title="Highlights a character when printing" value={this.state.highlight}>
												<option value="">-- Character --</option>
												{characters}
											</select>
										</div>
									</div>
								</div>}
							</li>
							<li  className={'col-sm-6 col-xs-12 dropdown ' + (this.state.g=='line'&&'open')}>
								<a onClick={this.toggle.bind(this, 'line')}>
									<i className="glyphicon glyphicon-align-center"></i>
									<span className="uppercase"> {editing.type || 'Line Type'} </span> 
									<b className="caret"></b>
								</a>
								{this.state.open == 'line' && <div className="popover bottom" style={ { display: 'block' } }>
									<div className="arrow"></div>
									<div className="list-group uppercase popover-content text-center">
										{types.map(function(type){
											return <a onClick={this.setType.bind(this, type)}
												key={type}
												className={'list-group-item '+(editing.type==type&&'active')}>
												{type}
											</a>
										}, this)}
									</div>
								</div>}
							</li>
						</ul>
					</div>
				</div>
				<header className="visible-print">
					<p className="uppercase">{this.props.script.title}</p>
					{this.props.script.authors && <p>by</p>}
					<p>{this.props.script.authors}</p>
					{this.state.highlight && <p className="character-highlighted">Character: {this.state.highlight.toUpperCase()}</p>}
					<address className="text-left">{this.props.script.leftAddress}</address>
					<address className="text-right">{this.props.script.rightAddress}</address>
				</header>
			</div>
		);
	}
});

var Home = React.createClass({
	newScript: function(){
		window.location.hash = '#/' + guid();
		window.location.reload(); // force firebase to reload
	},
	render: function() {
		var commentStyles = {
			color: '#dd0',
			textShadow: '0 1px 1px #000',
			fontSize: '120%'
		};
		return (
		        <div>

			        <div className="text-center">

				        <h1>Screenwriter</h1>
				        <p>
					        <a className="btn btn-primary" onClick={this.newScript}><i className="glyphicon glyphicon-plus"></i> New Script</a>
					        &nbsp;
					        <Link className="btn btn-primary" to="/demo">Demo Script</Link> 
				        </p>

				        <p>
					        <a className="btn btn-default" href="https://github.com/ProLoser/screenwriter"><img src="github-icons/GitHub-Mark-32px.png" alt="Github" /> Source Code</a>
				        </p>
			        </div>

			        <h3>Collaborate:</h3>
			        <p>Share your custom URL with friends to collaborate!</p>

			        <h3>Shortcuts:</h3>
			        <p>
				        <strong>Enter</strong> Insert new line<br />
				        <strong>(Shift+)Tab</strong> Cycle through line types<br />
				        <strong>Up/Down</strong> Move through lines<br />
				        <strong>Cmd/Ctrl+Up/Down</strong> Reorder lines<br />
				        <strong>Shift+Enter</strong> To select the top of the autocomplete suggestions<br />
			        </p>

			        <h3>Comments:</h3>
			        <p className="help">Hover over a line and click comment button <i className="glyphicon glyphicon-comment" style={commentStyles}></i></p>
		        </div>
		);
	}

});

var App = React.createClass({
	render: function() {
		return <RouteHandler />;
	}
});

Route = ReactRouter.Route;
Link = ReactRouter.Link;
RouteHandler = ReactRouter.RouteHandler;
DefaultRoute = ReactRouter.DefaultRoute;
var routes = (
	<Route handler={App}>
		<DefaultRoute handler={Home} />
		<Route name="script" path="/:scriptId" handler={Script}>
		</Route>
	</Route>
);


ReactRouter.run(routes, function (Handler) {
  React.render(<Handler/>, document.getElementById('container'));
});