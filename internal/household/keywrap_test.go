package household

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestKeyEnvelopeRoundTripAndRejectsTampering(t *testing.T) {
	password := []byte("fictional household passphrase")
	key := bytes.Repeat([]byte{0x8c}, 32)
	first, err := WrapKey(password, key)
	require.NoError(t, err)
	second, err := WrapKey(password, key)
	require.NoError(t, err)
	require.NotEqual(t, first, second)
	require.NotContains(t, first, key)
	got, err := UnwrapKey(password, first)
	require.NoError(t, err)
	require.Equal(t, key, got)
	_, err = UnwrapKey([]byte("incorrect"), first)
	require.Error(t, err)
	for _, index := range []int{0, 4, headerSize - 1, len(first) - 1} {
		modified := append([]byte(nil), first...)
		modified[index] ^= 1
		_, err = UnwrapKey(password, modified)
		require.Error(t, err)
	}
	_, err = UnwrapKey(password, first[:len(first)-1])
	require.Error(t, err)
	_, err = WrapKey(nil, key)
	require.Error(t, err)
}
