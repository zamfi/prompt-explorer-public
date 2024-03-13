import React, { Component, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import './App.css';

function useHidden(initialValue = true) {
  const [hidden, setHidden] = useState(initialValue);
  const [className, setClassName] = useState(initialValue ? 'hidden' : '');
  useEffect(() => {
    if (hidden) {
      setClassName('hidden');
    } else {
      setClassName('');
    }
  }, [hidden]);
  return {className, hidden, setHidden};
}

function OutputViewer(props) {
  const [runIndex, setRunIndex] = useState(0);
  const output = props.output;
  const run = output?.runs[runIndex];
  const promptProps = useHidden();
  const inputProps = useHidden();

  useEffect(() => {
    setRunIndex(output?.runs.length - 1);
  }, [output?.runs.length]);

  return (
    <div className="outputside">
      <div className={`output-controls ${output?.runs ? 'visible' : 'invisible'}`}>
        <button className="prev-run" disabled={runIndex === 0} onClick={() => setRunIndex(Math.max(0, runIndex - 1))}>〈</button>
        {output?.runs?.length > 1 ? <span className="output-count">{runIndex + 1}/{output?.runs.length}</span> : ''}
        <button className="next-run" disabled={runIndex === output?.runs.length - 1} onClick={() => setRunIndex(Math.min(output.runs.length - 1, runIndex + 1))}>〉</button>
        <pre className={`output-prompt ${promptProps.className}`} onClick={() => promptProps.setHidden(! promptProps.hidden)} >{run?.promptText}</pre>
        <pre className={`output-input ${inputProps.className}`} onClick={() => inputProps.setHidden(! inputProps.hidden)} >{run?.inputText}</pre>
      </div>
      <div className="output-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{run?.outputText}</ReactMarkdown>
      </div>
    </div>
  );
}

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      prompts: [],
      texts: [
        {label: 'Text 1', content: 'This is the first text.'},
      ],
      visibleTextIndex: 0
    };
  }

  async componentDidMount() {
    const response = await fetch('/loadAll', {method: 'POST'});
    const data = await response.json();
    console.log(data);
    let {prompts, texts, outputs} = data;
    for (let [label, prompt] of Object.entries(prompts)) {
      prompts[label] = {label, content: prompt};
    }
    if (Object.entries(texts).length > 0) {
      for (let [label, text] of Object.entries(texts)) {
        texts[label] = {label, content: text};
      }
    } else {
      texts = {};
      for (let text of this.state.texts) {
        texts[text.label] = text;
      }
    }

    // this is a bit of a nasty data structure, will probably come to bite us later...
    for (let outputLabel of Object.keys(outputs)) {
      let [textLabel, promptLabel] = outputLabel.split('|');
      let output = {
        prompt: prompts[promptLabel],
        text: texts[textLabel],
        runs: []
      };
      for (let run of outputs[outputLabel].split('\n\v\n')) {
        if (run.trim() === '') continue;
        let [inputText, promptText, outputText] = run.split('\n\f\n');
        output.runs.push({inputText, promptText, outputText});
      }
      console.log("creating new output with", output);
      if (! prompts[promptLabel].outputs) {
        prompts[promptLabel].outputs = [];
      }
      prompts[promptLabel].outputs.push(output);
      if (! texts[textLabel].outputs) {
        texts[textLabel].outputs = [];
      }
      texts[textLabel].outputs.push(output);
    }

    console.log("full set of prompts and texts is", prompts, texts);
    const newState = {
      prompts: Object.values(prompts),
      texts: Object.values(texts)
    };
    console.log("new state is", newState);
    this.setState(newState);
  }

  async handleInputChange(type, index, event) {
    const newList = [...this.state[`${type}s`]];
    newList[index].content = event.target.value;
    this.setState({[`${type}s`]: newList});

    await fetch('/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({label: newList[index].label, type: type, content: newList[index].content}),
    });
  }

  handleLabelChange(type, index, event) {
    const newList = [...this.state[`${type}s`]];
    const oldItem = newList[index];
    const oldLabel = oldItem.label;
    const newLabel = event.target.value.replace(/[^a-zA-Z0-9]/g, '_');
    if (this.state[`${type}s`].find(item => item !== oldItem && item.label === newLabel)) {
      newList[index].oldLabel = oldLabel;
      newList[index].invalidLabel = newLabel;
    } else {
      newList[index].label = newLabel;
      this.renameLabel(type, newList[index].oldLabel || oldLabel, newLabel, newList[index]);
      delete newList[index].oldLabel;
      delete newList[index].invalidLabel;
    }
    this.setState({[`${type}s`]: newList});
  }

  async renameLabel(type, oldLabel, newLabel, item) {
    const response = await fetch('/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({type, oldLabel, newLabel, content: item.content}),
    });
    const data = await response.json();
    if (data.status === 'error' && data.code === 'EEXIST') {
      alert('Label already exists');
      const newList = [...this.state[`${type}s`]];
      item.oldLabel = oldLabel;
      item.invalidLabel = newLabel;
      this.setState({[`${type}s`]: newList});
    }
  }

  async callAPI(text, prompt) {
    // find the output based on the text and prompt *object references*, not labels or content.
    let output = prompt.outputs?.find(output => output.text === text);
    if (output) {
      output.runs.push({
        promptText: prompt.content,
        inputText: text.content,
        outputText: 'Loading...'
      });
    } else {
      output = {
        prompt,
        text,
        runs: [{
          promptText: prompt.content,
          inputText: text.content,
          outputText: 'Loading...',
        }]
      };
      if (! prompt.outputs) {
        prompt.outputs = [];
      }
      prompt.outputs.push(output);
      if (! text.outputs) {
        text.outputs = [];
      }
      text.outputs.push(output);
    }
    this.setState({prompts: [...this.state.prompts], texts: [...this.state.texts]});
    
    const response = await fetch('/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({prompt: prompt.content, text: text.content}),
    });
    const data = await response.json();
    output.runs[output.runs.length-1].outputText = data.output;
    
    await fetch('/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({type: 'output', label: [text.label, prompt.label].join('|'), content: '\n\v\n'+[text.content, prompt.content, data.output].join('\n\f\n')}),
    });

    this.setState({prompts: [...this.state.prompts], texts: [...this.state.texts]});
  }

  addPrompt() {
    this.setState(prevState => ({
      prompts: [...prevState.prompts, {label: 'Label ' + (prevState.prompts.length + 1), content: '(placeholder)'}]
    }));
  }
  addText() {
    this.setState(prevState => ({
      texts: [...prevState.texts, {label: 'Label ' + (prevState.texts.length + 1), content: '(placeholder)'}],
      visibleTextIndex: prevState.texts.length
    }));
  }

  render() {
    const visibleText = this.state.texts[this.state.visibleTextIndex];
    return (
      <div>
        <h3>Texts</h3>
        <input className={`text-label ${'invalidLabel' in visibleText ? "invalid-label" : ""}`} value={visibleText.invalidLabel || visibleText.label} onChange={(e) => this.handleLabelChange('text', this.state.visibleTextIndex, e)} />
        <textarea className="text-text" value={visibleText.content} onChange={(e) => this.handleInputChange('text', this.state.visibleTextIndex, e)}></textarea>
        <div className="text-controls">
          <button className="prev-text" disabled={this.state.visibleTextIndex === 0} onClick={() => this.setState({visibleTextIndex: Math.max(0, this.state.visibleTextIndex - 1)})}>&laquo;</button>
          <button className="next-text" disabled={this.state.visibleTextIndex === this.state.texts.length - 1} onClick={() => this.setState({visibleTextIndex: Math.min(this.state.texts.length - 1, this.state.visibleTextIndex + 1)})}>&raquo;</button>
          <select className="text-select" value={this.state.visibleTextIndex} onChange={(e) => this.setState({visibleTextIndex: Number(e.target.value)})}>
            {this.state.texts.map((text, index) => (
              <option key={index} value={index}>{text.label}</option>
            ))}
          </select>
          <button className="add-text" onClick={() => this.addText()}>Add Text</button>
        </div>
        <h3>Prompts</h3>
        {this.state.prompts.map((prompt, index) => (
          <div key={index} className="ioblock">
            <div className="inputside">
              <input className={`inputlabel ${'invalidLabel' in prompt ? "invalid-label" : ""}`} value={prompt.invalidLabel || prompt.label} onChange={(e) => this.handleLabelChange('prompt', index, e)} />
              <textarea className="inputtext" value={prompt.content} onChange={(e) => this.handleInputChange('prompt', index, e)}></textarea>
            </div>
            <button className="process-button" onClick={() => this.callAPI(visibleText, prompt)}>Run&nbsp;&raquo;</button>
            <OutputViewer output={prompt.outputs?.find(output => output.text === visibleText)} />
          </div>
        ))}
        <button onClick={() => this.addPrompt()}>Add Prompt</button>
      </div>
    );
  }
}

export default App;
