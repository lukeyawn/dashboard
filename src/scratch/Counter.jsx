import { useState } from 'react';
export default function Counter() {
    const [count, setCount] = useState(0);

    return (
        <div className={count < 0 ? 'display negative' : 'display'}>
            {count}
            <button onClick={() => setCount(c => c + 1)}>+</button>
            <button onClick={() => setCount(c => c - 1)}>-</button>
            <button onClick={() => setCount(0)}>Reset</button>
        </div>
    )
}